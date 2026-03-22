/**
 * Navigation items for the pipeline workspace sidebar.
 *
 * These are shown when the user is inside a pipeline route
 * (/pipelines/:code/*). The paths are relative — they'll be
 * prefixed with `/pipelines/:code` at render time.
 */

import type { NavItemDef } from "@/app/navigation";
import {
  BarChart3,
  Download,
  FolderKanban,
  Layers,
  Settings,
  User,
  Workflow,
} from "@/tokens/icons";

/** Build pipeline workspace nav items for a given pipeline code. */
export function buildPipelineNavItems(pipelineCode: string): NavItemDef[] {
  const base = `/pipelines/${pipelineCode}`;

  return [
    { label: "Dashboard", path: `${base}/dashboard`, icon: BarChart3, prominent: true },
    { label: "Projects", path: `${base}/projects`, icon: FolderKanban, prominent: true },
    { label: "Characters", path: `${base}/characters`, icon: User, prominent: true },
    { label: "Scene Types", path: `${base}/scene-types`, icon: Layers, prominent: true },
    { label: "Workflows", path: `${base}/workflows`, icon: Workflow, prominent: true },
    { label: "Delivery", path: `${base}/delivery`, icon: Download, prominent: true },
    { label: "Settings", path: `${base}/settings`, icon: Settings },
  ];
}
