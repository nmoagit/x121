/**
 * Hook to build pipeline-aware paths.
 *
 * When inside a pipeline workspace, paths are prefixed with `/pipelines/{code}`.
 * When outside (global routes), paths use the root prefix.
 */

import { usePipelineContextSafe } from "@/features/pipelines";

/** Build a path that respects pipeline context. */
export function usePipelinePrefix(): (path: string) => string {
  const ctx = usePipelineContextSafe();
  const prefix = ctx ? `/pipelines/${ctx.pipeline.code}` : "";
  return (path: string) => `${prefix}${path}`;
}

/** Build an avatar detail path: /[pipelines/{code}/]projects/{pid}/avatars/{aid} */
export function useAvatarPath() {
  const withPrefix = usePipelinePrefix();
  return (projectId: number, avatarId: number, extra = "") =>
    withPrefix(`/projects/${projectId}/avatars/${avatarId}${extra}`);
}

/** Build a project path: /[pipelines/{code}/]projects/{pid} */
export function useProjectPath() {
  const withPrefix = usePipelinePrefix();
  return (projectId: number, extra = "") =>
    withPrefix(`/projects/${projectId}${extra}`);
}
