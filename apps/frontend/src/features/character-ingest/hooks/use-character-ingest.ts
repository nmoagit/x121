/**
 * TanStack Query hooks for the character ingest pipeline (PRD-113).
 *
 * Follows the key factory pattern used throughout the codebase.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type {
  CharacterIngestEntry,
  CharacterIngestSession,
  IngestConfirmResult,
  IngestEntryUpdate,
  IngestSessionDetail,
  IngestValidationSummary,
  MetadataTemplate,
  MetadataTemplateWithFields,
  ProjectValidationSummary,
  TextIngestRequest,
  VideoSpecRequirement,
} from "../types";

/* --------------------------------------------------------------------------
   Query key factories
   -------------------------------------------------------------------------- */

export const ingestKeys = {
  all: ["ingest"] as const,
  sessions: (projectId: number) =>
    [...ingestKeys.all, "sessions", projectId] as const,
  session: (projectId: number, sessionId: number) =>
    [...ingestKeys.all, "session", projectId, sessionId] as const,
  entries: (projectId: number, sessionId: number) =>
    [...ingestKeys.all, "entries", projectId, sessionId] as const,
  validationSummary: (projectId: number) =>
    [...ingestKeys.all, "validation-summary", projectId] as const,
};

export const templateKeys = {
  all: ["metadata-templates"] as const,
  lists: () => [...templateKeys.all, "list"] as const,
  detail: (id: number) => [...templateKeys.all, "detail", id] as const,
};

export const videoSpecKeys = {
  all: ["video-specs"] as const,
  lists: () => [...videoSpecKeys.all, "list"] as const,
};

/* --------------------------------------------------------------------------
   Ingest session hooks
   -------------------------------------------------------------------------- */

/** List all ingest sessions for a project. */
export function useIngestSessions(projectId: number) {
  return useQuery({
    queryKey: ingestKeys.sessions(projectId),
    queryFn: () =>
      api.get<CharacterIngestSession[]>(
        `/projects/${projectId}/ingest`,
      ),
    enabled: projectId > 0,
  });
}

/** Fetch a single ingest session with entries and counts. */
export function useIngestSession(projectId: number, sessionId: number) {
  return useQuery({
    queryKey: ingestKeys.session(projectId, sessionId),
    queryFn: () =>
      api.get<IngestSessionDetail>(
        `/projects/${projectId}/ingest/${sessionId}`,
      ),
    enabled: projectId > 0 && sessionId > 0,
  });
}

/** List entries for a session. */
export function useIngestEntries(projectId: number, sessionId: number) {
  return useQuery({
    queryKey: ingestKeys.entries(projectId, sessionId),
    queryFn: () =>
      api.get<CharacterIngestEntry[]>(
        `/projects/${projectId}/ingest/${sessionId}/entries`,
      ),
    enabled: projectId > 0 && sessionId > 0,
  });
}

/** Create an ingest session from text names. */
export function useIngestFromText(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TextIngestRequest) =>
      api.post<IngestSessionDetail>(
        `/projects/${projectId}/ingest/text`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ingestKeys.sessions(projectId),
      });
    },
  });
}

/** Update an ingest entry. */
export function useUpdateIngestEntry(projectId: number, sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      entryId,
      data,
    }: {
      entryId: number;
      data: IngestEntryUpdate;
    }) =>
      api.put<CharacterIngestEntry>(
        `/projects/${projectId}/ingest/${sessionId}/entries/${entryId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ingestKeys.session(projectId, sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: ingestKeys.entries(projectId, sessionId),
      });
    },
  });
}

/** Run validation on all entries in a session. */
export function useValidateSession(projectId: number, sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<IngestValidationSummary>(
        `/projects/${projectId}/ingest/${sessionId}/validate`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ingestKeys.session(projectId, sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: ingestKeys.entries(projectId, sessionId),
      });
    },
  });
}

/** Trigger metadata generation for entries. */
export function useGenerateMetadata(projectId: number, sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<CharacterIngestSession>(
        `/projects/${projectId}/ingest/${sessionId}/generate-metadata`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ingestKeys.session(projectId, sessionId),
      });
    },
  });
}

/** Confirm import — create characters from validated entries. */
export function useConfirmImport(projectId: number, sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<IngestConfirmResult>(
        `/projects/${projectId}/ingest/${sessionId}/confirm`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ingestKeys.sessions(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ingestKeys.session(projectId, sessionId),
      });
    },
  });
}

/** Cancel an ingest session. */
export function useCancelSession(projectId: number, sessionId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.delete(
        `/projects/${projectId}/ingest/${sessionId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ingestKeys.sessions(projectId),
      });
    },
  });
}

/* --------------------------------------------------------------------------
   Metadata template hooks
   -------------------------------------------------------------------------- */

/** List all metadata templates. */
export function useMetadataTemplates() {
  return useQuery({
    queryKey: templateKeys.lists(),
    queryFn: () => api.get<MetadataTemplate[]>("/metadata-templates"),
  });
}

/** Fetch a single metadata template with fields. */
export function useMetadataTemplate(id: number) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: () =>
      api.get<MetadataTemplateWithFields>(`/metadata-templates/${id}`),
    enabled: id > 0,
  });
}

/* --------------------------------------------------------------------------
   Video spec hooks
   -------------------------------------------------------------------------- */

/** List all video spec requirements. */
export function useVideoSpecs() {
  return useQuery({
    queryKey: videoSpecKeys.lists(),
    queryFn: () => api.get<VideoSpecRequirement[]>("/video-specs"),
  });
}

/* --------------------------------------------------------------------------
   Validation dashboard hooks
   -------------------------------------------------------------------------- */

/** Fetch project-level validation summary. */
export function useValidationSummary(projectId: number) {
  return useQuery({
    queryKey: ingestKeys.validationSummary(projectId),
    queryFn: () =>
      api.get<ProjectValidationSummary>(
        `/projects/${projectId}/validation-summary`,
      ),
    enabled: projectId > 0,
  });
}

/** Trigger project-wide revalidation. */
export function useRevalidateProject(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<ProjectValidationSummary>(
        `/projects/${projectId}/validate`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ingestKeys.validationSummary(projectId),
      });
      queryClient.invalidateQueries({
        queryKey: ingestKeys.sessions(projectId),
      });
    },
  });
}
