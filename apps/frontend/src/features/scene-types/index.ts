// Scene type configuration feature (PRD-23, PRD-100) - barrel exports.

export { SceneTypeEditor } from "./SceneTypeEditor";
export { PromptTemplateEditor, TEXTAREA_CLASSES } from "./PromptTemplateEditor";
export type { PromptTemplateValues } from "./PromptTemplateEditor";
export { SceneMatrixView } from "./SceneMatrixView";
export { OverrideIndicator } from "./OverrideIndicator";
export { InheritanceTree } from "./InheritanceTree";
export {
  sceneTypeKeys,
  useSceneTypes,
  useSceneType,
  useCreateSceneType,
  useUpdateSceneType,
  useDeleteSceneType,
  usePreviewPrompt,
  useGenerateMatrix,
  useValidateSceneType,
} from "./hooks/use-scene-types";
export {
  inheritanceKeys,
  mixinKeys,
  useChildren,
  useEffectiveConfig,
  useOverrides,
  useCascadePreview,
  useAppliedMixins,
  useMixins,
  useMixin,
  useCreateChild,
  useUpsertOverride,
  useDeleteOverride,
  useCreateMixin,
  useUpdateMixin,
  useDeleteMixin,
  useApplyMixin,
  useRemoveMixin,
} from "./hooks/use-scene-type-inheritance";
export type {
  SceneType,
  CreateSceneType,
  UpdateSceneType,
  PromptPreviewResponse,
  MatrixCell,
  ValidationResult,
  SceneTypeOverride,
  UpsertOverride,
  Mixin,
  CreateMixin,
  UpdateMixin,
  ApplyMixin,
  FieldSource,
  ResolvedField,
  EffectiveConfig,
} from "./types";
export { CLIP_POSITIONS } from "./types";
