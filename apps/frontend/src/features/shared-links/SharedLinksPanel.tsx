/**
 * Management panel listing all shared links (PRD-84).
 *
 * Shows a table of links with status, views, actions (revoke, copy URL),
 * and a button to create new links.
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Spinner } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { Plus, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { CreateLinkDialog } from "./CreateLinkDialog";
import { LinkActivityPanel } from "./LinkActivityPanel";
import { LinkStatusBadge } from "./LinkStatusBadge";
import { useRevokeLink, useSharedLinks } from "./hooks/use-shared-links";
import { SCOPE_TYPE_LABELS } from "./types";
import type { SharedLink } from "./types";

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function SharedLinksPanel() {
  const { data: links, isLoading } = useSharedLinks();
  const revokeMutation = useRevokeLink();

  const [showCreate, setShowCreate] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<SharedLink | null>(null);
  const [activityTarget, setActivityTarget] = useState<SharedLink | null>(
    null,
  );

  const handleConfirmRevoke = useCallback(() => {
    if (!revokeTarget) return;
    revokeMutation.mutate(revokeTarget.id, {
      onSuccess: () => setRevokeTarget(null),
    });
  }, [revokeTarget, revokeMutation]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Shared Links
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Create and manage shareable preview links for external review.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={iconSizes.md} />}
            onClick={() => setShowCreate(true)}
          >
            Create Link
          </Button>
        </div>

        {/* Links table */}
        <Card elevation="sm" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <TH>Scope</TH>
                  <TH>Created</TH>
                  <TH>Expires</TH>
                  <TH>Views</TH>
                  <TH>Status</TH>
                  <TH>Actions</TH>
                </tr>
              </thead>
              <tbody>
                {!links || links.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                    >
                      No shared links created. Click &quot;Create Link&quot; to
                      add one.
                    </td>
                  </tr>
                ) : (
                  links.map((link) => (
                    <LinkRow
                      key={link.id}
                      link={link}
                      onRevoke={setRevokeTarget}
                      onViewActivity={setActivityTarget}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Stack>

      {/* Create dialog */}
      <CreateLinkDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Revoke confirmation */}
      <Modal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Revoke Shared Link"
        size="sm"
      >
        {revokeTarget && (
          <Stack gap={4}>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Revoking this link will immediately prevent anyone from accessing
              it. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setRevokeTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmRevoke}
                loading={revokeMutation.isPending}
              >
                Revoke Link
              </Button>
            </div>
          </Stack>
        )}
      </Modal>

      {/* Activity panel modal */}
      <Modal
        open={activityTarget !== null}
        onClose={() => setActivityTarget(null)}
        title="Link Activity"
        size="lg"
      >
        {activityTarget && (
          <LinkActivityPanel linkId={activityTarget.id} />
        )}
      </Modal>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function TH({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
      {children}
    </th>
  );
}

interface LinkRowProps {
  link: SharedLink;
  onRevoke: (link: SharedLink) => void;
  onViewActivity: (link: SharedLink) => void;
}

function LinkRow({ link, onRevoke, onViewActivity }: LinkRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-3">
        <Badge variant="info" size="sm">
          {SCOPE_TYPE_LABELS[link.scope_type]} #{link.scope_id}
        </Badge>
      </td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
        {formatDateTime(link.created_at)}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
        {formatDateTime(link.expires_at)}
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {link.current_views}
        {link.max_views !== null ? ` / ${link.max_views}` : ""}
      </td>
      <td className="px-4 py-3">
        <LinkStatusBadge link={link} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewActivity(link)}
            aria-label="View activity"
          >
            Activity
          </Button>
          {!link.is_revoked && (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={iconSizes.sm} />}
              onClick={() => onRevoke(link)}
              aria-label="Revoke link"
            >
              Revoke
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
