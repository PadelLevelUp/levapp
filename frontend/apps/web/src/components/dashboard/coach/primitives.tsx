/**
 * Shared pieces for the coach dashboard.
 *
 * Rules these encode, so the blocks don't each re-decide them:
 * - green (`success`) means done and nothing else; amber (`warning`) means it
 *   needs the coach. No other status colour exists on this screen.
 * - a badge appears only when it carries information — a badge on every row is
 *   the same as no badge at all.
 * - every time, date and x/y count is tabular, so columns don't jitter.
 * - cards in a list use borders, never shadows. The hero is the only gradient.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section label. Uppercase, tracked, muted — never a heading element. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Capacity bar. Amber only when the class still has holes — a full class and an
 * under-filled one must not look alike, which is what the old uniform red bar
 * got wrong.
 */
export function FillBar({
  filled,
  capacity,
  className,
}: {
  filled: number;
  capacity: number;
  className?: string;
}) {
  const pct = capacity > 0 ? Math.min(100, (filled / capacity) * 100) : 0;
  const short = capacity > 0 && filled < capacity;

  return (
    <span
      className={cn(
        "inline-block h-[5px] w-11 overflow-hidden rounded-full",
        short ? "bg-warning/25" : "bg-muted",
        className,
      )}
    >
      <span
        className={cn("block h-full rounded-full", short ? "bg-warning" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** `2/6`, coloured amber only when short. Always tabular. */
export function FillCount({ filled, capacity }: { filled: number; capacity: number }) {
  const short = capacity > 0 && filled < capacity;
  return (
    <span
      className={cn(
        "text-xs font-bold tabular-nums",
        short ? "text-warning-strong" : "text-muted-foreground",
      )}
    >
      {filled}/{capacity}
    </span>
  );
}

/**
 * Overlapping player avatars, with a `+n` cap.
 *
 * `onNavy` exists because the hero keeps its navy surface in BOTH themes, so
 * the ring separating the circles has to match that surface rather than the
 * theme's card colour.
 */
export function AvatarStack({
  people,
  total,
  onNavy = false,
}: {
  people: Array<{ id: number; initials: string; name: string }>;
  total: number;
  onNavy?: boolean;
}) {
  const overflow = Math.max(0, total - people.length);
  const ring = onNavy ? "ring-sidebar" : "ring-card";

  return (
    <div className="flex items-center">
      {people.map((p, i) => (
        <span
          key={p.id}
          title={p.name}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold ring-2",
            ring,
            i % 2 === 0 ? "bg-primary text-primary-foreground" : "bg-info text-info-foreground",
            i > 0 && "-ml-2",
          )}
        >
          {p.initials}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            "-ml-2 grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold tabular-nums ring-2",
            ring,
            onNavy
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

/**
 * Status badge. Only two tones exist here by design:
 * `attention` (amber, needs the coach) and `done` (green, at capacity).
 */
export function StatusBadge({
  tone,
  children,
}: {
  tone: "attention" | "done";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums",
        tone === "attention"
          ? "bg-warning/15 text-warning-strong"
          : "bg-success/15 text-success-strong",
      )}
    >
      {children}
    </span>
  );
}

/**
 * A queue row. `accent` paints the 4px left edge, and only two accents exist —
 * amber for a class that needs players, blue for an inbound reply. Items with
 * nothing urgent carry no accent at all, which is what makes the accent mean
 * something when it does appear.
 */
export function ActionCard({
  accent,
  className,
  children,
  onClick,
}: {
  accent?: "attention" | "accent";
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const interactive = typeof onClick === "function";

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        // Border, not shadow — this is a card in a list.
        "rounded-2xl border border-border bg-card p-4",
        accent === "attention" && "border-l-4 border-l-warning",
        accent === "accent" && "border-l-4 border-l-primary",
        interactive && "cursor-pointer transition-colors hover:bg-accent/40",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A metric with its denominator. The sub line is not optional: a bare count
 * informs nobody whether it is good or bad, which is the whole reason the old
 * standalone counter tiles were dropped.
 */
export function StatCard({
  label,
  value,
  sub,
  children,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4">
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      <span className="font-display text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{sub}</span>
      {children}
    </div>
  );
}

/**
 * The 7-bar seats trend. Desktop only — at mobile width the bars would be a
 * few pixels each and read as decoration.
 */
export function Sparkbars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="mt-1 flex h-8 items-end gap-1" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            "flex-1 rounded-sm",
            i === values.length - 1 ? "bg-primary" : "bg-primary/25",
          )}
          // Floor at 6% so an empty day is still a visible baseline, not a gap.
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
