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
  avatarGroupKeys,
  useAvatarGroups,
  useCreateGroup,
  useUpdateGroup,
  useDeleteGroup,
  useMoveAvatarToGroup,
} from "./hooks/use-avatar-groups";
export {
  projectAvatarKeys,
  useProjectAvatars,
  useAvatar,
  useCreateAvatar,
  useBulkCreateAvatars,
  useUpdateAvatar,
  useDeleteAvatar,
} from "./hooks/use-project-avatars";
export { useGroupSelectOptions } from "./hooks/use-group-select-options";
export { useGroupMap } from "./hooks/use-group-map";

/* Types */
export type {
  Project,
  CreateProject,
  UpdateProject,
  ProjectStats,
  AvatarGroup,
  CreateAvatarGroup,
  UpdateAvatarGroup,
  Avatar,
  CreateAvatar,
  UpdateAvatar,
} from "./types";
export {
  STATUS_LABELS,
  STATUS_COLORS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_TABS,
  CHARACTER_TABS,
  PROJECT_STATUS_BADGE_VARIANT,
  avatarStatusLabel,
  avatarStatusBadgeVariant,
  projectStatusSlug,
} from "./types";
