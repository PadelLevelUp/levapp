import { cn } from "@/lib/utils";

/**
 * How full a class is, split three ways:
 *
 *   confirmed   players who actively said yes        (solid)
 *   awaiting    enrolled but not yet answered        (half-strength)
 *   free        seats still to fill                  (track)
 *
 * `participantCount` from the API is confirmed + awaiting — a player who has
 * not answered still holds their spot. So "7/16" alone cannot tell you whether
 * those 7 are coming; the split can.
 *
 * The block behind this can be any colour the coach picked, so the bar draws
 * in `currentColor` — the card has already resolved ink-or-white against that
 * hue for its label, so the bar inherits a guaranteed-legible colour without
 * knowing anything about the background. A fixed blue fought every warm card.
 */
export function ClassFillBar({
  confirmed,
  filled,
  capacity,
  className,
}: {
  confirmed: number;
  /** Spots taken — confirmed plus not-yet-answered. */
  filled: number;
  capacity: number;
  className?: string;
}) {
  if (!capacity || capacity <= 0) return null;

  const safeFilled = Math.max(0, Math.min(filled, capacity));
  const safeConfirmed = Math.max(0, Math.min(confirmed, safeFilled));
  const pct = (n: number) => `${(n / capacity) * 100}%`;

  // Tints are written as color-mix rather than Tailwind's `/opacity` modifier:
  // that modifier does not apply to `currentColor`, so `bg-current/15` compiles
  // to nothing and the bar silently disappears. Opacity on the elements is not
  // an option either — a parent's opacity would multiply into the children.
  const tint = (pctOfColor: number) =>
    `color-mix(in srgb, currentColor ${pctOfColor}%, transparent)`;

  return (
    <div
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full", className)}
      style={{ backgroundColor: tint(18) }}
      role="progressbar"
      aria-valuenow={safeConfirmed}
      aria-valuemin={0}
      aria-valuemax={capacity}
      data-testid="class-fill-bar"
      data-confirmed={safeConfirmed}
      data-filled={safeFilled}
      data-capacity={capacity}
    >
      <div
        className="h-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: pct(safeConfirmed), backgroundColor: "currentColor" }}
      />
      <div
        className="h-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: pct(safeFilled - safeConfirmed), backgroundColor: tint(45) }}
      />
    </div>
  );
}
