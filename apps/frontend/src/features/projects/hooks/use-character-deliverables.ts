import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { CharacterDeliverableRow } from "../types";
import { projectKeys } from "./use-projects";

export const deliverableKeys = {
  byProject: (projectId: number) => [...projectKeys.detail(projectId), "deliverables"] as const,
};

export function useCharacterDeliverables(projectId: number) {
  return useQuery({
    queryKey: deliverableKeys.byProject(projectId),
    queryFn: () => api.get<CharacterDeliverableRow[]>(`/projects/${projectId}/character-deliverables`),
  });
}
