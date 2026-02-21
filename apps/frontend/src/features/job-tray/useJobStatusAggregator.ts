/**
 * Aggregates job status from WebSocket events into a reactive summary.
 *
 * Uses a Zustand store so all consumers share the same state.
 * A single "connector" hook subscribes to PRD-010 event bus events:
 * - `job.status_changed` — a job moved to a new status
 * - `job.progress`       — a job reported progress update
 * - `job.created`        — a new job entered the queue
 *
 * Call `useJobStatusConnector()` once at the app root.
 * Call `useJobStatusAggregator()` anywhere to read the summary.
 */

import { useEffect } from "react";
import { create } from "zustand";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useEventBus } from "@/hooks/useEventBus";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export type JobStatus = "running" | "queued" | "completed" | "failed";

export interface JobDetail {
  id: string;
  name: string;
  status: JobStatus;
  progress: number;
  startedAt: number;
  elapsedMs: number;
  estimatedRemainingMs?: number;
}

export interface JobSummary {
  runningCount: number;
  queuedCount: number;
  overallProgress: number;
  jobs: JobDetail[];
}

/** Shape of events coming from the event bus. */
interface JobStatusEvent {
  jobId: string;
  jobName: string;
  status: JobStatus;
  progress: number;
  estimatedRemainingMs?: number;
}

interface JobProgressEvent {
  jobId: string;
  progress: number;
  estimatedRemainingMs?: number;
}

/** Shape of jobs returned from the API. */
interface ApiJob {
  id: string;
  name: string;
  status: string;
  progress: number;
  created_at: string;
  started_at?: string;
  estimated_remaining_ms?: number;
}

/* --------------------------------------------------------------------------
   Store
   -------------------------------------------------------------------------- */

interface JobStore extends JobSummary {
  _jobs: Map<string, JobDetail>;
  _recompute: () => void;
  seedFromApi: (apiJobs: ApiJob[]) => void;
  handleStatusChanged: (event: JobStatusEvent) => void;
  handleProgress: (event: JobProgressEvent) => void;
  handleCreated: (event: JobStatusEvent) => void;
  tickElapsed: () => void;
}

const ACTIVE_STATUSES: JobStatus[] = ["running", "queued"];

function isActiveStatus(status: string): status is JobStatus {
  return ACTIVE_STATUSES.includes(status as JobStatus);
}

function apiJobToDetail(j: ApiJob): JobDetail {
  const started = j.started_at ? new Date(j.started_at).getTime() : Date.now();
  return {
    id: j.id,
    name: j.name,
    status: isActiveStatus(j.status) ? j.status : (j.status as JobStatus),
    progress: j.progress,
    startedAt: started,
    elapsedMs: Date.now() - started,
    estimatedRemainingMs: j.estimated_remaining_ms,
  };
}

function computeFromMap(jobs: Map<string, JobDetail>): Omit<JobSummary, "jobs"> & { jobs: JobDetail[] } {
  let runningCount = 0;
  let queuedCount = 0;
  let progressSum = 0;
  let activeCount = 0;
  const jobList: JobDetail[] = [];

  for (const job of jobs.values()) {
    if (job.status === "running") {
      runningCount++;
      progressSum += job.progress;
      activeCount++;
      jobList.push(job);
    } else if (job.status === "queued") {
      queuedCount++;
      activeCount++;
      jobList.push(job);
    }
  }

  const overallProgress = activeCount > 0 ? Math.round(progressSum / activeCount) : 0;
  return { runningCount, queuedCount, overallProgress, jobs: jobList };
}

export const useJobStore = create<JobStore>((set, get) => ({
  runningCount: 0,
  queuedCount: 0,
  overallProgress: 0,
  jobs: [],
  _jobs: new Map(),

  _recompute() {
    const summary = computeFromMap(get()._jobs);
    set(summary);
  },

  seedFromApi(apiJobs: ApiJob[]) {
    const map = new Map<string, JobDetail>();
    for (const j of apiJobs) {
      map.set(j.id, apiJobToDetail(j));
    }
    set({ _jobs: map });
    get()._recompute();
  },

  handleStatusChanged(event: JobStatusEvent) {
    const map = get()._jobs;
    if (event.status === "completed" || event.status === "failed") {
      map.delete(event.jobId);
    } else {
      const existing = map.get(event.jobId);
      const now = Date.now();
      map.set(event.jobId, {
        id: event.jobId,
        name: event.jobName,
        status: event.status,
        progress: event.progress,
        startedAt: existing?.startedAt ?? now,
        elapsedMs: existing ? now - existing.startedAt : 0,
        estimatedRemainingMs: event.estimatedRemainingMs,
      });
    }
    get()._recompute();
  },

  handleProgress(event: JobProgressEvent) {
    const map = get()._jobs;
    const existing = map.get(event.jobId);
    if (existing) {
      const now = Date.now();
      map.set(event.jobId, {
        ...existing,
        progress: event.progress,
        elapsedMs: now - existing.startedAt,
        estimatedRemainingMs: event.estimatedRemainingMs,
      });
      get()._recompute();
    }
  },

  handleCreated(event: JobStatusEvent) {
    const map = get()._jobs;
    map.set(event.jobId, {
      id: event.jobId,
      name: event.jobName,
      status: "queued",
      progress: 0,
      startedAt: Date.now(),
      elapsedMs: 0,
    });
    get()._recompute();
  },

  tickElapsed() {
    const map = get()._jobs;
    let dirty = false;
    const now = Date.now();

    for (const [id, job] of map) {
      if (job.status === "running") {
        map.set(id, { ...job, elapsedMs: now - job.startedAt });
        dirty = true;
      }
    }
    if (dirty) get()._recompute();
  },
}));

/* --------------------------------------------------------------------------
   Connector hook — call once at app root
   -------------------------------------------------------------------------- */

const ELAPSED_TICK_MS = 1000;

export function useJobStatusConnector(): void {
  const { seedFromApi, handleStatusChanged, handleProgress, handleCreated, tickElapsed } =
    useJobStore.getState();

  /* -- Seed from API ---------------------------------------------------- */
  useQuery({
    queryKey: ["jobs", "active"],
    queryFn: async () => {
      const data = await api.get<ApiJob[]>("/jobs?status=running&status=queued");
      seedFromApi(data);
      return data;
    },
    refetchInterval: 30_000,
  });

  /* -- Subscribe to WebSocket events ------------------------------------ */
  useEventBus<JobStatusEvent>("job.status_changed", handleStatusChanged);
  useEventBus<JobProgressEvent>("job.progress", handleProgress);
  useEventBus<JobStatusEvent>("job.created", handleCreated);

  /* -- Tick elapsed time for running jobs ------------------------------- */
  useEffect(() => {
    const timer = setInterval(tickElapsed, ELAPSED_TICK_MS);
    return () => clearInterval(timer);
  }, [tickElapsed]);
}

/* --------------------------------------------------------------------------
   Consumer hook — call anywhere to read the summary
   -------------------------------------------------------------------------- */

export function useJobStatusAggregator(): JobSummary {
  const runningCount = useJobStore((s) => s.runningCount);
  const queuedCount = useJobStore((s) => s.queuedCount);
  const overallProgress = useJobStore((s) => s.overallProgress);
  const jobs = useJobStore((s) => s.jobs);

  return { runningCount, queuedCount, overallProgress, jobs };
}
