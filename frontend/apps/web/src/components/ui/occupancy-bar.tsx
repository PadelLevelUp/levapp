import { cn } from "@/lib/utils";

/**
 * How full a class is, as a bar. The number alone ("2/6") tells you the state
 * only once you read and divide it; the bar tells you before you read.
 *
 * Width is the one thing this system animates — 280ms, and nothing bounces.
 * `motion-reduce` collapses it, per the motion rules.
 */
export function OccupancyBar({
  filled,
  total,
  className,
  label,
}: {
  filled: number;
  total: number;
  className?: string;
  /** Accessible description, e.g. "2 of 6 seats filled". */
  label?: string;
}) {
  const safeTotal = total > 0 ? total : 0;
  const pct = safeTotal === 0 ? 0 : Math.min(100, Math.round((filled / safeTotal) * 100));
  const isFull = safeTotal > 0 && filled >= safeTotal;

  return (
    <div
      className={cn("h-1.5 w-full rounded-full bg-border overflow-hidden", className)}
      role="progressbar"
      aria-valuenow={filled}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-label={label}
      data-testid="occupancy-bar"
      data-filled={filled}
      data-total={safeTotal}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
          // Full is DONE — the one job green has. Short of full is just a
          // reading, so it stays informational: the "Missing N" badge already
          // carries the call to action, and amber on every row shouts.
          isFull ? "bg-success" : "bg-primary"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Parses the "2/6" the dashboard emits as `rightLabel`. */
export function parseOccupancy(
  label: string | undefined
): { filled: number; total: number } | null {
  if (!label) return null;
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(label);
  if (!m) return null;
  return { filled: Number(m[1]), total: Number(m[2]) };
}
