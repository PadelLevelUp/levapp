/**
 * Bottom padding for the conversation composer, in points.
 *
 * The composer row already carries 12pt of padding on every side, so the
 * input sits 12pt below the row's top border. This is the *extra* inset added
 * under that row (messaging.conversation-detail rule 13):
 *
 * - keyboard open → 0. The keyboard covers the home indicator, so anything
 *   more renders as a band under the input that the top of the row does not
 *   have (the composer looked pushed up and off-centre).
 * - keyboard down → the safe-area inset, so the input clears the home
 *   indicator on a pushed route with no tab bar.
 */
export function composerBottomPadding(
  keyboardVisible: boolean,
  safeAreaBottom: number
): number {
  if (keyboardVisible) return 0;
  return Math.max(safeAreaBottom, 0);
}
