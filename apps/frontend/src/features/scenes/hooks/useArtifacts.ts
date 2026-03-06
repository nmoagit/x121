import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { SceneVideoVersionArtifact } from "../types";

export const artifactKeys = {
  all: ["scene-version-artifacts"] as const,
  list: (sceneId: number, versionId: number) =>
    [...artifactKeys.all, "list", sceneId, versionId] as const,
};

export function useVersionArtifacts(sceneId: number, versionId: number, enabled = true) {
  return useQuery({
    queryKey: artifactKeys.list(sceneId, versionId),
    queryFn: () =>
      api.get<SceneVideoVersionArtifact[]>(
        `/scenes/${sceneId}/versions/${versionId}/artifacts`,
      ),
    enabled: sceneId > 0 && versionId > 0 && enabled,
  });
}
