/**
 * Dismissable overlay banner shown once per page per session.
 * Provides a first-time description of each page for new users.
 */

import { useCallback, useState } from "react";
import { useLocation } from "@tanstack/react-router";

import { cn } from "@/lib/cn";
import { Info, X } from "@/tokens/icons";

/** Descriptions keyed by route path. Only pages listed here show the banner. */
const PAGE_GUIDES: Record<string, string> = {
  "/": "Welcome to αN2N. This is your Studio Pulse dashboard — a real-time overview of active tasks, generation progress, and system health across all projects.",
  "/performance": "Track generation performance metrics, quality scores, and resource utilization over time. Use date range filters to compare periods.",
  "/dashboard/customize": "Rearrange, add, or remove dashboard widgets to create your ideal studio overview. Changes are saved per-user.",
  "/projects": "Your projects hub. Each project groups avatars, scenes, and deliverables together. Create a new project to get started.",
  "/content/scene-catalogue": "The scene catalogue defines your scene types (e.g. Close-up, Wide Shot), their track configurations, prompt defaults, and workflow assignments. This is the blueprint that drives generation.",
  "/content/library": "Browse all avatars across projects in one place. Filter by scene type or track, preview assets, and jump to avatar details.",
  "/content/scenes": "View and manage individual scene clips. Filter by avatar, scene type, or status. Import clips or review QA actions.",
  "/content/derived-clips": "Browse derived and imported clips — clips that were created from or linked to a parent version. Filter, review QA status, and scan directories for new imports.",
  "/content/avatars": "Manage avatars across projects. Drop folders to bulk-import seed images and metadata. Click any avatar to view or upload their seed data.",
  "/content/storyboard": "Visual storyboard layout of scenes in sequence. Drag to reorder, preview clips inline.",
  "/content/images": "Browse and manage image variants (seed images, track images). Approve, reject, or regenerate variants.",
  "/content/avatar-dashboard": "Per-avatar readiness dashboard showing image counts, scene progress, metadata status, and blocking issues.",
  "/content/contact-sheet": "Grid view of all approved images for an avatar — useful for visual consistency checks before delivery.",
  "/content/duplicates": "Detect and resolve duplicate avatars or assets across projects.",
  "/production/queue": "The generation queue. View pending, running, and completed jobs. Prioritise, pause, or cancel individual items.",
  "/production/generation": "Monitor active generation runs in real time. View ComfyUI progress, logs, and infrastructure status.",
  "/production/test-shots": "Generate and compare test shots before committing to full batch runs. Useful for prompt and workflow tuning.",
  "/production/batch": "Manage batch generation runs across multiple avatars and scenes simultaneously.",
  "/production/delivery": "Track delivery exports. Package approved scenes and images for final delivery to clients.",
  "/production/checkpoints": "Quality checkpoints that must be passed before scenes advance to the next stage.",
  "/production/debugger": "Debug failed generation jobs. View error logs, workflow state, and retry options.",
  "/production/render-timeline": "Gantt-style timeline showing when each scene was rendered, duration, and GPU utilisation.",
  "/review/annotations": "Browse all annotated frames across projects. Click any card to view the video with annotation overlay, then navigate to the specific scene.",
  "/reviews": "Your assigned review queue. Start a review to approve or reject avatar scenes.",
  "/review/notes": "View and manage review notes left on scenes and clips during the review process.",
  "/review/production-notes": "Internal production notes for the team — tracking decisions, blockers, and context.",
  "/review/qa-gates": "Quality gates that scenes must pass before advancing. Configure pass/fail criteria per scene type.",
  "/review/cinema": "Full-screen cinema mode for reviewing clips at native resolution with frame-by-frame controls.",
  "/review/temporal": "Temporal consistency analysis — detect drift in model appearance across scenes over time.",
  "/tools/workflows": "Manage ComfyUI workflows. View, edit, validate, and assign workflows to scene types.",
  "/tools/prompts": "Browse and edit prompt templates. Version-controlled with diff history.",
  "/tools/config": "Global configuration settings for the platform — defaults, feature flags, and system parameters.",
  "/tools/presets": "Pre-built configuration presets for common setups. Apply a preset to quickly configure a project.",
  "/tools/search": "Full-text search across projects, avatars, scenes, and prompts.",
  "/tools/branching": "Experiment with scene variations using branches. Compare results side-by-side before merging.",
  "/tools/activity-console": "Real-time activity log stream. Monitor backend events, generation progress, and system activity.",
  "/tools/avatar-ingest": "Bulk-import avatars from folder structures. Map folders to avatars, validate, and import.",
  "/tools/batch-metadata": "View and edit metadata across multiple avatars at once.",
  "/tools/pipeline-hooks": "Configure hooks that run at pipeline stages — pre-generation, post-generation, on-approval, etc.",
  "/tools/workflow-import": "Import ComfyUI workflow JSON files. Validates nodes, inputs, and compatibility before saving.",
  "/tools/undo": "Undo tree — view and restore previous states for scenes, prompts, and configurations.",
  "/admin/infrastructure": "Control panel for ComfyUI instances and cloud GPU resources. Start, stop, and monitor instances.",
  "/admin/cloud-gpus": "Manage cloud GPU providers, scaling rules, and cost budgets. Monitor instance health and utilisation.",
  "/admin/storage": "Monitor storage usage across projects. Identify large files and clean up unused assets.",
  "/admin/naming": "Configure automatic naming rules for avatars, scenes, and files based on project conventions.",
  "/admin/queue": "Advanced queue management — job allocation, priority rules, worker assignment, and hold/release controls.",
  "/admin/hardware": "Hardware inventory dashboard — track GPU models, memory, driver versions, and health status.",
  "/admin/workers": "Monitor worker processes that execute generation jobs. View load, capacity, and error rates.",
  "/admin/integrity": "Run integrity checks on the database and file system. Detect orphaned records or missing files.",
  "/admin/audit": "Full audit log of all user actions — who changed what, when. Export as CSV or JSON.",
  "/admin/reclamation": "Identify and reclaim storage from failed generations, orphaned files, and old versions.",
  "/admin/downloads": "Manage downloadable export packages for projects and deliverables.",
  "/admin/api-keys": "Create and manage API keys for external integrations. Set permissions and expiry dates.",
  "/admin/extensions": "Browse and install platform extensions that add new features or integrations.",
  "/admin/maintenance": "System maintenance tools — cache clearing, index rebuilding, and health diagnostics.",
  "/admin/onboarding-wizard": "Step-by-step wizard for setting up a new project — storage, workflows, scene types, and first avatar.",
  "/admin/legacy-import": "Import data from legacy systems or previous platform versions.",
  "/admin/readiness": "Pre-flight readiness checks — verify infrastructure, workflows, and configuration before starting generation.",
  "/admin/settings": "Platform-wide settings — authentication, defaults, and system behaviour.",
  "/admin/themes": "Customise the visual theme — colours, fonts, and branding.",
  "/admin/job-scheduling": "Schedule recurring generation jobs — daily batches, off-peak runs, or milestone-triggered builds.",
  "/admin/session-management": "View and manage active user sessions. Force logout or revoke access.",
  "/admin/webhook-testing": "Test webhook endpoints by sending sample payloads and inspecting responses.",
  "/admin/api-observability": "Monitor API endpoint performance — latency, error rates, and request volume heatmaps.",
  "/admin/trigger-workflows": "Manually trigger ComfyUI workflows with custom parameters for testing or one-off runs.",
  "/admin/backups": "Manage database and file system backups. Schedule automatic backups and verify restore points.",
  "/admin/budgets": "Set and monitor cost budgets per project, provider, or time period.",
  "/admin/gpu-scheduling": "Fine-grained GPU power scheduling — set active hours, idle policies, and power-saving modes.",
  "/admin/disk-usage": "Detailed disk usage breakdown by project, model, and file type.",
  "/admin/failure-analytics": "Analyse generation failure patterns — common errors, failure rates by workflow, and resolution suggestions.",
  "/admin/importer": "General-purpose data importer for bulk operations.",
  "/admin/config-import": "Import configuration bundles (scene types, workflows, prompts) from JSON exports.",
  "/settings/shortcuts": "View and customise keyboard shortcuts for common actions.",
  "/settings/wiki": "Built-in knowledge base — documentation, guides, and tips for using the platform.",
};

/** Session-scoped set of dismissed paths (resets on page refresh). */
const dismissed = new Set<string>();

export function PageGuideBanner() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(() => !dismissed.has(pathname));

  const guide = PAGE_GUIDES[pathname];

  const dismiss = useCallback(() => {
    dismissed.add(pathname);
    setVisible(false);
  }, [pathname]);

  // Re-check visibility when pathname changes (component stays mounted in AppShell)
  // We use pathname as key on the parent to remount, but also handle it here
  if (!guide || dismissed.has(pathname)) {
    if (visible) setVisible(false);
    return null;
  }

  if (!visible) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-md)] px-4 py-3 mb-4",
        "bg-[var(--color-action-primary)]/10 border border-[var(--color-action-primary)]/20",
        "animate-[fadeIn_var(--duration-normal)_var(--ease-default)]",
      )}
    >
      <Info size={16} className="shrink-0 mt-0.5 text-[var(--color-action-primary)]" />
      <p className="flex-1 text-sm text-[var(--color-text-secondary)] leading-relaxed">
        {guide}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] transition-colors"
        aria-label="Dismiss guide"
      >
        <X size={14} />
      </button>
    </div>
  );
}
