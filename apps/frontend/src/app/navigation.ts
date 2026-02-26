import type { UserRole } from "@/stores/auth-store";
import {
  Activity,
  BarChart3,
  Columns,
  Cpu,
  Download,
  Edit3,
  Eye,
  File,
  Folder,
  HardDrive,
  Image,
  Info,
  Keyboard,
  Layers,
  Layout,
  List,
  Lock,
  Monitor,
  Palette,
  Play,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Upload,
  User,
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
      { label: "Scene Types", path: "/content/scene-types", icon: Settings },
      { label: "Scene Catalog", path: "/content/scene-catalog", icon: List },
      { label: "Character Dashboard", path: "/content/character-dashboard", icon: Monitor },
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
      { label: "Readiness", path: "/admin/readiness", icon: ShieldCheck },
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
