import type { UserRole } from "@/stores/auth-store";
import {
  Activity,
  BarChart3,
  Bug,
  Calendar,
  Cloud,
  Columns,
  Cpu,
  DollarSign,
  Download,
  Edit3,
  Eye,
  File,
  FileSearch,
  FileText,
  Folder,
  FolderKanban,
  HardDrive,
  Image,
  Info,
  Keyboard,
  Layers,
  Layout,
  Link2,
  List,
  Lock,
  Monitor,
  Palette,
  Play,
  Power,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  Timer,
  TrendingUp,
  Undo2,
  Upload,
  User,
  Users,
  Wrench,
  Zap,
} from "@/tokens/icons";
import type { LucideIcon } from "lucide-react";

export interface NavItemDef {
  label: string;
  path: string;
  icon: LucideIcon;
  requiredRole?: UserRole;
}

export interface NavGroupDef {
  label: string;
  items: NavItemDef[];
  requiredRole?: UserRole;
}

export const NAV_GROUPS: NavGroupDef[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Home", path: "/", icon: BarChart3 },
      { label: "Performance", path: "/performance", icon: Activity },
      { label: "Customize", path: "/dashboard/customize", icon: Settings },
    ],
  },
  {
    label: "Projects",
    items: [
      { label: "All Projects", path: "/projects", icon: FolderKanban },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Scenes", path: "/content/scenes", icon: Layers },
      { label: "Characters", path: "/content/characters", icon: User },
      { label: "Library", path: "/content/library", icon: Folder },
      { label: "Storyboard", path: "/content/storyboard", icon: Layout },
      { label: "Images", path: "/content/images", icon: Image },
      { label: "Scene Catalog", path: "/content/scene-catalog", icon: List },
      { label: "Character Dashboard", path: "/content/character-dashboard", icon: Monitor },
      { label: "Contact Sheet", path: "/content/contact-sheet", icon: Image },
      { label: "Duplicates", path: "/content/duplicates", icon: FileSearch },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Queue", path: "/production/queue", icon: Zap },
      { label: "Generation", path: "/production/generation", icon: Play },
      { label: "Test Shots", path: "/production/test-shots", icon: Eye },
      { label: "Batch", path: "/production/batch", icon: Columns },
      { label: "Delivery", path: "/production/delivery", icon: Download },
      { label: "Checkpoints", path: "/production/checkpoints", icon: ShieldCheck },
      { label: "Debugger", path: "/production/debugger", icon: Bug },
      { label: "Render Timeline", path: "/production/render-timeline", icon: Timer },
    ],
  },
  {
    label: "Review",
    items: [
      { label: "Annotations", path: "/review/annotations", icon: Edit3 },
      { label: "Notes", path: "/review/notes", icon: File },
      { label: "Production Notes", path: "/review/production-notes", icon: File },
      { label: "QA Gates", path: "/review/qa-gates", icon: ShieldCheck },
      { label: "Cinema", path: "/review/cinema", icon: Monitor },
      { label: "Temporal", path: "/review/temporal", icon: TrendingUp },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "Prompts", path: "/tools/prompts", icon: Edit3 },
      { label: "Workflows", path: "/tools/workflows", icon: RefreshCw },
      { label: "Config", path: "/tools/config", icon: Settings },
      { label: "Presets", path: "/tools/presets", icon: Palette },
      { label: "Search", path: "/tools/search", icon: Search },
      { label: "Branching", path: "/tools/branching", icon: Columns },
      { label: "Activity Console", path: "/tools/activity-console", icon: Terminal },
      { label: "Character Ingest", path: "/tools/character-ingest", icon: Upload },
      { label: "Batch Metadata", path: "/tools/batch-metadata", icon: Layers },
      { label: "Pipeline Hooks", path: "/tools/pipeline-hooks", icon: Link2 },
      { label: "Import Workflow", path: "/tools/workflow-import", icon: Upload },
      { label: "Undo Tree", path: "/tools/undo", icon: Undo2 },
    ],
  },
  {
    label: "Admin",
    requiredRole: "admin",
    items: [
      { label: "Hardware", path: "/admin/hardware", icon: Monitor },
      { label: "Workers", path: "/admin/workers", icon: Server },
      { label: "Integrity", path: "/admin/integrity", icon: Cpu },
      { label: "Audit", path: "/admin/audit", icon: Lock },
      { label: "Reclamation", path: "/admin/reclamation", icon: HardDrive },
      { label: "Storage", path: "/admin/storage", icon: HardDrive },
      { label: "Downloads", path: "/admin/downloads", icon: Download },
      { label: "API Keys", path: "/admin/api-keys", icon: Lock },
      { label: "Extensions", path: "/admin/extensions", icon: Layers },
      { label: "Maintenance", path: "/admin/maintenance", icon: Settings },
      { label: "Onboarding Wizard", path: "/admin/onboarding-wizard", icon: Upload },
      { label: "Legacy Import", path: "/admin/legacy-import", icon: Upload },
      { label: "Naming Rules", path: "/admin/naming", icon: FileText },
      { label: "Readiness", path: "/admin/readiness", icon: ShieldCheck },
      { label: "Settings", path: "/admin/settings", icon: Settings },
      { label: "Themes", path: "/admin/themes", icon: Palette },
      { label: "Cloud GPUs", path: "/admin/cloud-gpus", icon: Cloud },
      { label: "Job Scheduling", path: "/admin/job-scheduling", icon: Calendar },
      { label: "Sessions", path: "/admin/session-management", icon: Users },
      { label: "Webhook Testing", path: "/admin/webhook-testing", icon: Zap },
      { label: "API Observability", path: "/admin/api-observability", icon: Activity },
      { label: "Trigger Workflows", path: "/admin/trigger-workflows", icon: Wrench },
      { label: "Backups", path: "/admin/backups", icon: HardDrive },
      { label: "Budgets", path: "/admin/budgets", icon: DollarSign },
      { label: "GPU Scheduling", path: "/admin/gpu-scheduling", icon: Power },
      { label: "Disk Usage", path: "/admin/disk-usage", icon: HardDrive },
      { label: "Failure Analytics", path: "/admin/failure-analytics", icon: TrendingUp },
      { label: "Importer", path: "/admin/importer", icon: Upload },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Shortcuts", path: "/settings/shortcuts", icon: Keyboard },
      { label: "Wiki", path: "/settings/wiki", icon: Info },
    ],
  },
];
