// Components
export { JobTrayIcon } from "./JobTrayIcon";
export { JobTrayPanel } from "./JobTrayPanel";
export { SoundPreferences } from "./SoundPreferences";

// Hooks
export { useJobStatusAggregator, useJobStatusConnector } from "./useJobStatusAggregator";
export type { JobDetail, JobSummary, JobStatus } from "./useJobStatusAggregator";
export { useJobToasts } from "./useJobToasts";
export { useTabTitleProgress } from "./useTabTitleProgress";
export { useSoundAlerts } from "./useSoundAlerts";
export { playSound, useSoundPreferencesStore, SOUND_IDS, SOUND_LABELS } from "./useSoundAlerts";
export type { SoundId, SoundPreferences as SoundPreferencesType } from "./useSoundAlerts";
