/**
 * Barrel export for project hub & management feature (PRD-112).
 */

/* Pages */
export { ProjectListPage } from "./ProjectListPage";
export { ProjectDetailPage } from "./ProjectDetailPage";

/* Hooks */
export {
  projectKeys,
  useProjects,
  useProject,
  useProjectStats,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from "./hooks/use-projects";
export {
  characterGroupKeys,
  useCharacterGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useMoveCharacterToGroup,
} from "./hooks/use-character-groups";
export {
  projectCharacterKeys,
  useProjectCharacters,
  useCharacter,
  useCreateCharacter,
  useBulkCreateCharacters,
  useUpdateCharacter,
  useDeleteCharacter,
} from "./hooks/use-project-characters";
export { useGroupSelectOptions } from "./hooks/use-group-select-options";
export { useGroupMap } from "./hooks/use-group-map";

/* Types */
export type {
  Project,
  CreateProject,
  UpdateProject,
  ProjectStats,
  CharacterGroup,
  CreateCharacterGroup,
  UpdateCharacterGroup,
  Character,
  CreateCharacter,
  UpdateCharacter,
} from "./types";
export {
  STATUS_LABELS,
  STATUS_COLORS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_TABS,
  CHARACTER_TABS,
  PROJECT_STATUS_BADGE_VARIANT,
  characterStatusLabel,
  characterStatusBadgeVariant,
  projectStatusSlug,
} from "./types";
