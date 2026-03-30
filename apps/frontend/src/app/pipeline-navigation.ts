/**
 * Navigation groups for the pipeline workspace sidebar.
 *
 * These are shown when the user is inside a pipeline route
 * (/pipelines/:code/*). Each group mirrors the structure of the
 * global navigation but with paths scoped to the pipeline.
 */

import type { NavGroupDef } from "@/app/navigation";
import {
  BarChart3,
  Bug,
  Columns,
  Download,
  Edit3,
  Eye,
  File,
  FileSearch,
  FileText,
  Film,
  Folder,
  FolderKanban,
  GitBranch,
  Image,
  Layout,
  Layers,
  Link2,
  List,
  Monitor,
  Palette,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Terminal,
  Timer,
  TrendingUp,
  Undo2,
  Upload,
  User,
  Users,
  Zap,
} from "@/tokens/icons";

/** Build pipeline workspace nav groups for a given pipeline code. */
export function buildPipelineNavGroups(pipelineCode: string): NavGroupDef[] {
  const base = `/pipelines/${pipelineCode}`;

  return [
    {
      label: "Overview",
      items: [
        { label: "Dashboard", path: `${base}/dashboard`, icon: BarChart3, prominent: true },
      ],
    },
    {
      label: "Projects",
      items: [
        { label: "All Projects", path: `${base}/projects`, icon: FolderKanban, prominent: true, exact: true },
      ],
    },
    {
      label: "Content",
      items: [
        { label: "Avatars", path: `${base}/avatars`, icon: User, prominent: true },
        { label: "Library", path: `${base}/library`, icon: Folder, prominent: true },
        { label: "Media", path: `${base}/media`, icon: Image, prominent: true },
        { label: "Scenes", path: `${base}/scenes`, icon: Layers, prominent: true },
        { label: "Derived Clips", path: `${base}/derived-clips`, icon: GitBranch, prominent: true },
        { label: "Catalogue", path: `${base}/scene-catalogue`, icon: List, prominent: true },
        { label: "Storyboard", path: `${base}/storyboard`, icon: Layout },
        { label: "Avatar Dashboard", path: `${base}/avatar-dashboard`, icon: Monitor },
        { label: "Contact Sheet", path: `${base}/contact-sheet`, icon: Image },
        { label: "Duplicates", path: `${base}/duplicates`, icon: FileSearch },
      ],
    },
    {
      label: "Production",
      items: [
        { label: "Queue", path: `${base}/queue`, icon: Zap, prominent: true },
        { label: "Generation", path: `${base}/generation`, icon: Play },
        { label: "Test Shots", path: `${base}/test-shots`, icon: Eye },
        { label: "Batch", path: `${base}/batch`, icon: Columns },
        { label: "Delivery", path: `${base}/delivery`, icon: Download },
        { label: "Checkpoints", path: `${base}/checkpoints`, icon: ShieldCheck },
        { label: "Debugger", path: `${base}/debugger`, icon: Bug },
        { label: "Render Timeline", path: `${base}/render-timeline`, icon: Timer },
      ],
    },
    {
      label: "Review",
      items: [
        { label: "Annotations", path: `${base}/annotations`, icon: Edit3, prominent: true },
        { label: "Reviews", path: `${base}/reviews`, icon: Users, prominent: true },
        { label: "Notes", path: `${base}/notes`, icon: File },
        { label: "Production Notes", path: `${base}/production-notes`, icon: File },
        { label: "QA Gates", path: `${base}/qa-gates`, icon: ShieldCheck },
        { label: "Cinema", path: `${base}/cinema`, icon: Monitor },
        { label: "Temporal", path: `${base}/temporal`, icon: TrendingUp },
      ],
    },
    {
      label: "Tools",
      items: [
        { label: "Workflows", path: `${base}/workflows`, icon: RefreshCw, prominent: true },
        { label: "Prompts", path: `${base}/prompts`, icon: Edit3 },
        { label: "Config", path: `${base}/config`, icon: Settings },
        { label: "Presets", path: `${base}/presets`, icon: Palette },
        { label: "Search", path: `${base}/search`, icon: Search },
        { label: "Branching", path: `${base}/branching`, icon: Columns },
        { label: "Activity Console", path: `${base}/activity-console`, icon: Terminal },
        { label: "Avatar Ingest", path: `${base}/avatar-ingest`, icon: Upload },
        { label: "Batch Metadata", path: `${base}/batch-metadata`, icon: Layers },
        { label: "Pipeline Hooks", path: `${base}/pipeline-hooks`, icon: Link2 },
        { label: "Import Workflow", path: `${base}/workflow-import`, icon: Upload },
        { label: "Undo Tree", path: `${base}/undo`, icon: Undo2 },
      ],
    },
    {
      label: "Pipeline Admin",
      items: [
        { label: "Naming Rules", path: `${base}/naming`, icon: FileText, prominent: true },
        { label: "Output Profiles", path: `${base}/output-profiles`, icon: Film, prominent: true },
        { label: "Settings", path: `${base}/settings`, icon: Settings },
      ],
    },
  ];
}
