/**
 * Storage backend management page (PRD-48).
 *
 * Renders the BackendConfigPanel with live data from the storage hooks,
 * plus an active migration progress view when a migration is in flight.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { LoadingPane } from "@/components/primitives";

import {
  BackendConfigPanel,
  MigrationProgressView,
  useMigration,
  useRollbackMigration,
  useSetDefaultBackend,
  useStorageBackends,
} from "@/features/storage";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StoragePage() {
  const { data: backends, isLoading } = useStorageBackends();
  const setDefault = useSetDefaultBackend();
  const rollback = useRollbackMigration();

  const [activeMigrationId, setActiveMigrationId] = useState<number | null>(null);
  const { data: migration } = useMigration(activeMigrationId ?? 0, activeMigrationId !== null);

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Storage Backends"
          description="Configure storage backends, tiering policies, and data migration."
        />

        {isLoading && <LoadingPane />}

        {!isLoading && (
          <BackendConfigPanel
            backends={backends ?? []}
            onSetDefault={(backend) => setDefault.mutate(backend.id)}
          />
        )}

        {migration && (
          <MigrationProgressView
            migration={migration}
            onRollback={(id) => {
              rollback.mutate(id, {
                onSuccess: () => setActiveMigrationId(null),
              });
            }}
          />
        )}
      </Stack>
    </div>
  );
}
