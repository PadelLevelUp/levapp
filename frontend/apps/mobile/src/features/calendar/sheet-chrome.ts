/**
 * The day sheet's chrome on iOS — calendar.mobile-views rule 3, PAD-286 / B-065.
 *
 * Kept in a plain module so the mobile unit runner (which cannot render
 * components) can pin the iOS-only numbers (the handle and collapsed heights are
 * shared in `@levelup/config`): they mirror web's `rounded-t-[20px]` and
 * `shadow-[0_-10px_24px_rgba(11,21,36,0.14)]`. The shadow goes on the sheet's
 * OUTER view and the corner clipping on an inner one — a view that clips its
 * children also clips its own shadow on iOS.
 */
export const SHEET_TOP_RADIUS = 20;
/** Navy `#0B1524` at 14%, cast upward; a CSS blur of 24px is a shadowRadius of 12. */
export const SHEET_SHADOW = {
  shadowColor: "#0B1524",
  shadowOffset: { width: 0, height: -10 },
  shadowOpacity: 0.14,
  shadowRadius: 12,
  // Android ignores the four props above and draws depth from `elevation`
  // (mobile.android-runtime rule 1); iOS ignores this one. NativeWind's
  // `shadow-lg` is elevation 8, so the sheet keeps the depth it had before
  // PAD-286 moved it to raw props.
  elevation: 8,
} as const;
