/**
 * Shared image type workflow table for project/group/avatar workflow panels.
 *
 * Shows image types with their catalogue-level workflow assignment (read-only
 * at override levels — workflow is set at the catalogue level).
 */

import { cn } from "@/lib/cn";
import { TERMINAL_SELECT, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { ArrowRight } from "@/tokens/icons";

import { useUpdateImageType } from "@/features/image-catalogue/hooks/use-image-catalogue";
import type { ImageType } from "@/features/image-catalogue/types";
import { TYPO_DATA, TYPO_DATA_MUTED, TYPO_LABEL} from "@/lib/typography-tokens";

const TH_CLS = `w-1/4 px-3 py-1.5 text-left ${TYPO_LABEL}`;
const SELECT_CLS = cn(TERMINAL_SELECT, "max-w-[200px]");

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImageWorkflowTableProps {
  imageTypes: ImageType[];
  workflowOptions: { value: string; label: string }[];
  tracks: { id: number; name: string; slug: string }[];
  /** When true, workflow dropdown is editable. When false, read-only display. */
  editable?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImageWorkflowTable({ imageTypes, workflowOptions, tracks, editable = false }: ImageWorkflowTableProps) {
  if (imageTypes.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-border-default)]/30">
            <th className={TH_CLS}>Image Type</th>
            <th className={TH_CLS}>Tracks</th>
            <th className={`w-1/3 px-3 py-1.5 text-left ${TYPO_LABEL}`}>Workflow</th>
            <th className={`w-[100px] px-3 py-1.5 text-left ${TYPO_LABEL}`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {imageTypes.map((it) => (
            <ImageWorkflowRow
              key={it.id}
              imageType={it}
              workflowOptions={workflowOptions}
              tracks={tracks}
              editable={editable}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Row
   -------------------------------------------------------------------------- */

function ImageWorkflowRow({
  imageType,
  workflowOptions,
  tracks,
  editable,
}: {
  imageType: ImageType;
  workflowOptions: { value: string; label: string }[];
  tracks: { id: number; name: string; slug: string }[];
  editable: boolean;
}) {
  const updateMutation = useUpdateImageType(imageType.id);
  const srcTrack = tracks.find((t) => t.id === imageType.source_track_id);
  const outTrack = tracks.find((t) => t.id === imageType.output_track_id);
  const wfName = workflowOptions.find((o) => o.value === String(imageType.workflow_id))?.label;

  return (
    <tr className="border-b border-[var(--color-border-default)]/30 last:border-b-0">
      <td className={`px-3 py-1.5 ${TYPO_DATA} uppercase tracking-wide`}>
        {imageType.name}
      </td>
      <td className={`px-3 py-1.5 ${TYPO_DATA}`}>
        {srcTrack && outTrack ? (
          <div className="flex items-center gap-1">
            <span className={TRACK_TEXT_COLORS[srcTrack.slug] ?? "text-[var(--color-text-muted)]"}>{srcTrack.name}</span>
            <ArrowRight size={8} className="text-[var(--color-text-muted)]" />
            <span className={TRACK_TEXT_COLORS[outTrack.slug] ?? "text-[var(--color-text-muted)]"}>{outTrack.name}</span>
          </div>
        ) : (
          <span className="text-[var(--color-text-muted)]">—</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {editable ? (
          <select
            className={SELECT_CLS}
            value={imageType.workflow_id?.toString() ?? ""}
            onChange={(e) => {
              const wfId = e.target.value ? Number(e.target.value) : null;
              updateMutation.mutate({ workflow_id: wfId });
            }}
          >
            <option value="">None</option>
            {workflowOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <span className={TYPO_DATA_MUTED}>
            {wfName ?? "not set"}
          </span>
        )}
      </td>
      <td className={`px-3 py-1.5 ${TYPO_DATA}`}>
        {imageType.workflow_id != null ? (
          <span className="text-[var(--color-data-green)]">set</span>
        ) : (
          <span className="text-[var(--color-text-muted)]">not set</span>
        )}
      </td>
    </tr>
  );
}
