/**
 * Pipeline Stage Hooks feature public API (PRD-77).
 */

// Components
export { ExecutionLogViewer } from "./ExecutionLogViewer";
export { HookManager } from "./HookManager";
export { HookTestConsole } from "./HookTestConsole";
export { InheritanceView } from "./InheritanceView";

// Hooks
export {
  hookKeys,
  useCreateHook,
  useDeleteHook,
  useEffectiveHooks,
  useHook,
  useHookLogs,
  useHooks,
  useJobHookLogs,
  useTestHook,
  useToggleHook,
  useUpdateHook,
} from "./hooks/use-pipeline-hooks";

// Types
export type {
  CreateHookRequest,
  EffectiveHook,
  FailureMode,
  Hook,
  HookExecutionLog,
  HookPoint,
  HookType,
  ScopeType,
  UpdateHookRequest,
} from "./types";

export {
  FAILURE_MODE_LABELS,
  HOOK_POINT_LABELS,
  failureModeVariant,
  hookTypeVariant,
} from "./types";
