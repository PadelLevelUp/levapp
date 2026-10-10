/**
 * PAD-587 (mobile.launch rule 2): when the launch overlay may start its final fade. It ends at the
 * earlier of its own animation and "the first screen is ready" plus a short grace — but never
 * before the fonts are ready (a font ERROR counts as ready: the app falls back to system type
 * rather than staying blank), or the brand moment would hand over to unstyled text.
 */
export const LAUNCH_RELEASE_GRACE_MS = 300;

/** True once both conditions hold; the caller waits `LAUNCH_RELEASE_GRACE_MS` from that moment. */
export function overlayMayRelease({ fontsReady, firstScreenReady }: { fontsReady: boolean; firstScreenReady: boolean }): boolean {
  return fontsReady && firstScreenReady;
}
