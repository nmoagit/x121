/**
 * TanStack Query hooks for the languages lookup table (PRD-136).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Language } from "../types";

/* --------------------------------------------------------------------------
   Query key factory
   -------------------------------------------------------------------------- */

export const languageKeys = {
  all: () => ["languages"] as const,
};

/* --------------------------------------------------------------------------
   Query hooks
   -------------------------------------------------------------------------- */

export function useLanguages() {
  return useQuery({
    queryKey: languageKeys.all(),
    queryFn: () => api.get<Language[]>("/languages"),
  });
}

/* --------------------------------------------------------------------------
   Mutation hooks
   -------------------------------------------------------------------------- */

export function useCreateLanguage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; name: string; flag_code: string }) =>
      api.post<Language>("/languages", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: languageKeys.all() }),
  });
}
