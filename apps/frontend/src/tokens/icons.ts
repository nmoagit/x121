/**
 * Centralized icon registry.
 *
 * All icon usage in the app should import from this module.
 * To swap the underlying icon library, only this file needs to change.
 */
export {
  // Navigation
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Search,
  ArrowLeft,
  ArrowRight,
  // Actions
  Archive,
  ArchiveRestore,
  RotateCcw,
  Plus,
  Minus,
  Trash2,
  Edit3,
  Copy,
  Download,
  Upload,
  Save,
  RefreshCw,
  // Status
  Star,
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  Loader2,
  // Media
  Clapperboard,
  File,
  FileText,
  Folder,
  Image,
  Video,
  FileVideo,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Repeat,
  Volume2,
  VolumeX,
  // Layout / Panels
  GripVertical,
  LayoutGrid,
  Layout,
  Maximize2,
  Minimize2,
  Columns,
  // UI
  Keyboard,
  Settings,
  User,
  LogOut,
  Eye,
  EyeOff,
  Moon,
  Sun,
  SunMoon,
  Monitor,
  Palette,
  // Job / Activity
  Layers,
  List,
  Bell,
  BellOff,
  Clock,
  Ban,
  Square,
  CircleCheck,
  CircleX,
  Activity,
  // Dashboard
  HardDrive,
  BarChart3,
  Zap,
  // Collaboration
  Lock,
  Unlock,
  // Pipeline
  GitBranch,
  // Workers
  Server,
  Cpu,
  Power,
  ShieldCheck,
  // Cloud / Status Footer
  Cloud,
  Workflow,
  // Console
  Terminal,
  ArrowDown,
  ArrowUp,
  // Language / Multilingual
  Globe,
  FileJson,
  // Projects
  FolderKanban,
  Film,
  Mic,
  // Gap-fill additions
  Bug,
  ListFilter,
  Calendar,
  DollarSign,
  FileSearch,
  Link2,
  Timer,
  TrendingUp,
  Undo2,
  Users,
  MessageSquare,
  Sparkles,
  Wand2,
  Wrench,
  // Avatar Review
  CheckCircle,
  UserPlus,
  ArrowRightLeft,
  // Infrastructure
  Wifi,
  WifiOff,
  RotateCw,
  ScanEye,
  ScanSearch,
  Shield,
  CircleDot,
  // Collapse / Expand
  ChevronsDownUp,
  ChevronsUpDown,
  // Bulk actions
  Tag,
  // Derived clips
  FolderSearch,
} from "lucide-react";

/** Standard icon size tokens (px values matching design grid) */
export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSize = keyof typeof iconSizes;
