/**
 * Pipeline context provider.
 *
 * Wraps pipeline-scoped routes and provides the current pipeline data
 * to all child components via React context.
 */

import { createContext, useContext, type ReactNode } from "react";

import { EmptyState } from "@/components/domain";
import { LoadingPane } from "@/components/primitives";
import { Workflow } from "@/tokens/icons";

import type { Pipeline } from "./types";
import { usePipelineByCode } from "./hooks/use-pipelines";

/* --------------------------------------------------------------------------
   Context
   -------------------------------------------------------------------------- */

interface PipelineContextValue {
  pipeline: Pipeline;
  pipelineId: number;
  pipelineCode: string;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

/** Access the current pipeline from context. Throws if used outside PipelineProvider. */
export function usePipelineContext(): PipelineContextValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) {
    throw new Error("usePipelineContext must be used within a PipelineProvider");
  }
  return ctx;
}

/** Access the current pipeline from context, or null if not in a pipeline route. */
export function usePipelineContextSafe(): PipelineContextValue | null {
  return useContext(PipelineContext);
}

/* --------------------------------------------------------------------------
   Provider
   -------------------------------------------------------------------------- */

interface PipelineProviderProps {
  pipelineCode: string;
  children: ReactNode;
}

export function PipelineProvider({ pipelineCode, children }: PipelineProviderProps) {
  const { data: pipeline, isLoading, error } = usePipelineByCode(pipelineCode);

  if (isLoading) {
    return <LoadingPane />;
  }

  if (error || !pipeline) {
    return (
      <EmptyState
        icon={<Workflow size={32} />}
        title="Pipeline not found"
        description={`No pipeline with code "${pipelineCode}" exists.`}
      />
    );
  }

  const value: PipelineContextValue = {
    pipeline,
    pipelineId: pipeline.id,
    pipelineCode: pipeline.code,
  };

  return (
    <PipelineContext.Provider value={value}>
      {children}
    </PipelineContext.Provider>
  );
}
