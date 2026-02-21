import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface AssetType {
  id: number;
  name: string;
  description: string | null;
}

export interface AssetStatus {
  id: number;
  name: string;
  description: string | null;
}

export interface AssetWithStats {
  id: number;
  name: string;
  version: string;
  asset_type_id: number;
  status_id: number;
  file_path: string;
  file_size_bytes: number;
  checksum_sha256: string;
  description: string | null;
  metadata: Record<string, unknown>;
  registered_by: number | null;
  created_at: string;
  updated_at: string;
  avg_rating: number;
  rating_count: number;
  dependency_count: number;
  type_name: string;
  status_name: string;
}

export interface Asset {
  id: number;
  name: string;
  version: string;
  asset_type_id: number;
  status_id: number;
  file_path: string;
  file_size_bytes: number;
  checksum_sha256: string;
  description: string | null;
  metadata: Record<string, unknown>;
  registered_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface AssetDependency {
  id: number;
  asset_id: number;
  dependent_entity_type: string;
  dependent_entity_id: number;
  dependency_role: string;
  created_at: string;
  updated_at: string;
}

export interface AssetNote {
  id: number;
  asset_id: number;
  related_asset_id: number | null;
  note_text: string;
  severity: string;
  author_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface AssetRating {
  id: number;
  asset_id: number;
  rating: number;
  review_text: string | null;
  reviewer_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface RatingSummary {
  asset_id: number;
  avg_rating: number;
  total_ratings: number;
}

export interface AssetDetail {
  asset: Asset;
  notes: AssetNote[];
  rating_summary: RatingSummary;
  dependencies: AssetDependency[];
}

export interface AssetSearchParams {
  name?: string;
  asset_type_id?: number;
  status_id?: number;
  limit?: number;
  offset?: number;
}

interface CreateAssetInput {
  name: string;
  version: string;
  asset_type_id: number;
  file_path: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

interface RateAssetInput {
  rating: number;
  review_text?: string;
}

/* --------------------------------------------------------------------------
   Query keys
   -------------------------------------------------------------------------- */

const assetKeys = {
  all: ["assets"] as const,
  list: (params: AssetSearchParams) => [...assetKeys.all, "list", params] as const,
  detail: (id: number) => [...assetKeys.all, "detail", id] as const,
  notes: (id: number) => [...assetKeys.all, "notes", id] as const,
  ratings: (id: number) => [...assetKeys.all, "ratings", id] as const,
  dependencies: (id: number) => [...assetKeys.all, "dependencies", id] as const,
  impact: (id: number) => [...assetKeys.all, "impact", id] as const,
};

/* --------------------------------------------------------------------------
   Hooks
   -------------------------------------------------------------------------- */

/** Build query string from search params, omitting undefined values. */
function buildQueryString(params: AssetSearchParams): string {
  const parts: string[] = [];
  if (params.name) parts.push(`name=${encodeURIComponent(params.name)}`);
  if (params.asset_type_id != null) parts.push(`asset_type_id=${params.asset_type_id}`);
  if (params.status_id != null) parts.push(`status_id=${params.status_id}`);
  if (params.limit != null) parts.push(`limit=${params.limit}`);
  if (params.offset != null) parts.push(`offset=${params.offset}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** Fetch the list of assets with optional filters. */
export function useAssets(params: AssetSearchParams = {}) {
  return useQuery({
    queryKey: assetKeys.list(params),
    queryFn: () => api.get<AssetWithStats[]>(`/assets${buildQueryString(params)}`),
  });
}

/** Fetch a single asset's full detail (notes, ratings, dependencies). */
export function useAssetDetail(id: number | null) {
  return useQuery({
    queryKey: assetKeys.detail(id ?? 0),
    queryFn: () => api.get<AssetDetail>(`/assets/${id}`),
    enabled: id !== null,
  });
}

/** Fetch notes for a specific asset. */
export function useAssetNotes(id: number | null) {
  return useQuery({
    queryKey: assetKeys.notes(id ?? 0),
    queryFn: () => api.get<AssetNote[]>(`/assets/${id}/notes`),
    enabled: id !== null,
  });
}

/** Fetch ratings for a specific asset. */
export function useAssetRatings(id: number | null) {
  return useQuery({
    queryKey: assetKeys.ratings(id ?? 0),
    queryFn: () => api.get<AssetRating[]>(`/assets/${id}/ratings`),
    enabled: id !== null,
  });
}

/** Create a new asset. */
export function useCreateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAssetInput) => api.post<Asset>("/assets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}

/** Rate an asset. */
export function useRateAsset(assetId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RateAssetInput) => api.put<AssetRating>(`/assets/${assetId}/rating`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(assetId) });
      queryClient.invalidateQueries({ queryKey: assetKeys.ratings(assetId) });
      queryClient.invalidateQueries({ queryKey: assetKeys.all });
    },
  });
}
