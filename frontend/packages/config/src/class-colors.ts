/**
 * The colours a coach can pick for a class — calendar.mobile-views rule 6.
 *
 * Colour is the class's IDENTITY; its state is carried by treatment (solid,
 * outlined, faded, red, dashed — see `calendar-card.ts`). For that to read,
 * no pickable hue may look like a status: amber means "needs the coach",
 * red means "canceled", green means "done" (`tokens.ts`). The eight below are
 * therefore cool and neutral only. Every picker on web and iOS renders this
 * list; there is no second copy.
 *
 * `RETIRED_CLASS_COLOR_REMAP` is mirrored by hand in
 * `backend/padel_app/tools/class_colors.py`, where the one-off Alembic data
 * migration reads it — `test_class_colors_remap.py` pins the two together.
 */
export const CLASS_COLOR_SWATCHES = [
  "#1355DC", // blue — the brand primary
  "#0EA5E9", // sky
  "#0891B2", // cyan
  "#0D9488", // teal
  "#6366F1", // indigo
  "#8B5CF6", // violet
  "#A21CAF", // plum
  "#475569", // slate
] as const;

export type ClassColorSwatch = (typeof CLASS_COLOR_SWATCHES)[number];

/** Retired swatch (lower-case) → its replacement. Decided 2026-09-08. */
export const RETIRED_CLASS_COLOR_REMAP: Record<string, string> = {
  "#ef4444": "#A21CAF", // red → plum
  "#f97316": "#0891B2", // orange → cyan
  "#eab308": "#0D9488", // yellow → teal
  "#22c55e": "#0D9488", // green → teal
};

/**
 * Map a stored class colour off the retired hues. Anything that is not one of
 * the four retired swatches — kept swatches, legacy free-form values, null —
 * comes back untouched, which is what makes the migration idempotent.
 */
export function remapClassColor<T extends string | null | undefined>(value: T): T | string {
  if (typeof value !== "string") return value;
  const replacement = RETIRED_CLASS_COLOR_REMAP[value.toLowerCase()];
  return replacement ?? value;
}
