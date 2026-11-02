/**
 * PAD-817 (B-722, mobile.android-runtime rule 9c): the class side sheet's bottom padding.
 *
 * The app draws edge to edge on Android, so a bottom sheet in a `Modal` runs under the
 * navigation bar; the sheet's Cancel / Send row sat behind it and could not be tapped. On
 * Android the padding grows by the bottom safe-area inset. iOS keeps the sheet as it was.
 */
export const SIDE_SHEET_PADDING = 20;

export function sideSheetPaddingBottom(os: string, insets: { bottom: number }): number {
  return os === "android" ? SIDE_SHEET_PADDING + insets.bottom : SIDE_SHEET_PADDING;
}
