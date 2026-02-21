import { cn } from "@/lib/cn";
import { Volume2, VolumeX } from "@/tokens/icons";

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  className?: string;
}

export function VolumeControl({
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  className,
}: VolumeControlProps) {
  return (
    <div className={cn("flex items-center gap-[var(--spacing-1)]", className)}>
      <button
        type="button"
        onClick={onToggleMute}
        className="p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={isMuted ? 0 : volume}
        onChange={(e) => onVolumeChange(Number(e.target.value))}
        className="w-16 h-1 accent-[var(--color-action-primary)] cursor-pointer"
        title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
      />
    </div>
  );
}
