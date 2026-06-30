import { cn } from "@/lib/utils";

interface LevelLabelProps {
  /** Short level identifier, e.g. "B1". Rendered emphasised. */
  code: string;
  /** Human-readable level name, e.g. "Beginner". Rendered muted. */
  label: string;
  className?: string;
}

/**
 * Renders a coach level with the code visually distinguished from its label:
 * a bold code, a "|" separator, and a muted label. Used across all level
 * selection components (PAD-14) so the formatting stays consistent.
 */
export function LevelLabel({ code, label, className }: LevelLabelProps) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="font-semibold">{code}</span>
      <span className="text-muted-foreground" aria-hidden="true">
        |
      </span>
      <span>{label}</span>
    </span>
  );
}
