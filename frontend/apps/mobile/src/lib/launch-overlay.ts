/**
 * PAD-587 (auth.login rule 8, iOS clause): when the launch overlay may end. It ends at the earlier
 * of its own animation and "the first screen is ready" plus a short grace — but never before the
 * fonts are ready, or the brand moment would hand over to unstyled text.
 */
export const LAUNCH_RELEASE_GRACE_MS = 300;

export type OverlayInput = {
  fontsReady: boolean;
  /** When the first screen became ready (ms on the same clock as `now`), or null. */
  firstScreenReadyAt: number | null;
  now: number;
};

/** True when the overlay should start its final fade now. */
export function overlayShouldRelease({ fontsReady, firstScreenReadyAt, now }: OverlayInput): boolean {
  if (!fontsReady) return false;
  if (firstScreenReadyAt === null) return false;
  return now - firstScreenReadyAt >= LAUNCH_RELEASE_GRACE_MS;
}
