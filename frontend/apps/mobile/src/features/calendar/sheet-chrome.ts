/**
 * The day sheet's chrome on iOS — calendar.mobile-views rule 3, PAD-286 / B-065.
 *
 * Kept in a plain module so the mobile unit runner (which cannot render
 * components) can pin the numbers: they mirror web's `rounded-t-[20px]` and
 * `shadow-[0_-10px_24px_rgba(11,21,36,0.14)]`. The shadow goes on the sheet's
 * OUTER view and the corner clipping on an inner one — a view that clips its
 * children also clips its own shadow on iOS.
 */
export const SHEET_TOP_RADIUS = 20;
/** The grab handle's row: tall enough to catch without aiming at the pill. */
export const SHEET_HANDLE_HEIGHT = 28;
/** Navy `#0B1524` at 14%, cast upward; a CSS blur of 24px is a shadowRadius of 12. */
export const SHEET_SHADOW = {
  shadowColor: "#0B1524",
  shadowOffset: { width: 0, height: -10 },
  shadowOpacity: 0.14,
  shadowRadius: 12,
} as const;
/** Handle row plus the DayHeader's height: what stays visible at `max`. */
export const SHEET_COLLAPSED_HEIGHT = SHEET_HANDLE_HEIGHT + 76;
