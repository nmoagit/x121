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
  X,
  Search,
  ArrowLeft,
  ArrowRight,
  // Actions
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
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  Loader2,
  // Media
  File,
  Folder,
  Image,
  Video,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Repeat,
  Volume2,
  VolumeX,
  // Layout / Panels
  GripVertical,
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
  Monitor,
  Palette,
} from "lucide-react";

/** Standard icon size tokens (px values matching design grid) */
export const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSize = keyof typeof iconSizes;
