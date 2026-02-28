/**
 * Reference manager for regression testing (PRD-65).
 *
 * Lists all regression reference scenes with their baseline scores,
 * and provides controls for adding/removing references.
 */

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { qaMetricLabel } from "@/lib/qa-constants";

import {
  useCreateReference,
  useDeleteReference,
  useRegressionReferences,
} from "./hooks/use-regression";
import type { CreateRegressionReference, RegressionReference } from "./types";

/* --------------------------------------------------------------------------
   Reference row
   -------------------------------------------------------------------------- */

function ReferenceRow({
  reference,
  onDelete,
  isDeleting,
}: {
  reference: RegressionReference;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}) {
  const scoreEntries = Object.entries(reference.baseline_scores);

  return (
    <div
      data-testid={`reference-row-${reference.id}`}
      className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-text-primary)] font-medium">
            Character {reference.character_id}
          </span>
          <span className="text-[var(--color-text-muted)]">/</span>
          <span className="text-[var(--color-text-secondary)]">
            Scene Type {reference.scene_type_id}
          </span>
        </div>
        {scoreEntries.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {scoreEntries.map(([metric, score]) => (
              <Badge key={metric} variant="default" size="sm">
                {qaMetricLabel(metric)}: {score.toFixed(2)}
              </Badge>
            ))}
          </div>
        )}
        {reference.notes && (
          <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">
            {reference.notes}
          </p>
        )}
      </div>
      <Button
        variant="danger"
        size="sm"
        onClick={() => onDelete(reference.id)}
        disabled={isDeleting}
        loading={isDeleting}
        data-testid={`delete-reference-${reference.id}`}
      >
        Delete
      </Button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ReferenceManager() {
  const { data: references, isLoading } = useRegressionReferences();
  const deleteRef = useDeleteReference();
  const _createRef = useCreateReference();

  function handleDelete(id: number) {
    deleteRef.mutate(id);
  }

  function handleAdd() {
    // Placeholder: in production this would open a form dialog
    const placeholder: CreateRegressionReference = {
      character_id: 1,
      scene_type_id: 1,
      reference_scene_id: 1,
      baseline_scores: {},
    };
    _createRef.mutate(placeholder);
  }

  if (isLoading) {
    return (
      <div data-testid="reference-manager">
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-text-muted)]">
              Loading references...
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const list = references ?? [];

  return (
    <div data-testid="reference-manager">
      <Card>
        <CardHeader className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Regression References
        </h3>
        <Button
          variant="primary"
          size="sm"
          onClick={handleAdd}
          loading={_createRef.isPending}
          data-testid="add-reference-btn"
        >
          Add Reference
        </Button>
      </CardHeader>
      <CardBody className="p-0">
        {list.length === 0 ? (
          <div
            data-testid="references-empty"
            className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center"
          >
            No references configured. Add one to start regression testing.
          </div>
        ) : (
          list.map((ref) => (
            <ReferenceRow
              key={ref.id}
              reference={ref}
              onDelete={handleDelete}
              isDeleting={deleteRef.isPending}
            />
          ))
        )}
      </CardBody>
      </Card>
    </div>
  );
}
