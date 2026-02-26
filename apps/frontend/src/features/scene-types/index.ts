// Scene type configuration feature (PRD-23) - barrel exports.

export { SceneTypeEditor } from "./SceneTypeEditor";
export { PromptTemplateEditor, TEXTAREA_CLASSES } from "./PromptTemplateEditor";
export type { PromptTemplateValues } from "./PromptTemplateEditor";
export { SceneMatrixView } from "./SceneMatrixView";
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
export type {
  SceneType,
  CreateSceneType,
  UpdateSceneType,
  PromptPreviewResponse,
  MatrixCell,
  ValidationResult,
} from "./types";
export { CLIP_POSITIONS } from "./types";
