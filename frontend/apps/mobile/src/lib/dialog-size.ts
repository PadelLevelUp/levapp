/**
 * PAD-496: how tall a dialog may be. The dialog overlay centres its content, so a dialog taller
 * than the window loses its title above the screen and its footer below it, and neither can be
 * reached. Bound to the window minus the safe areas (notch, home indicator) and the overlay's
 * own margin, a dialog with a list in it shrinks the list instead (the list must be allowed to:
 * `flexShrink: 1`), and its header and footer stay on screen.
 *
 * `keyboardHeight` is for a dialog with a text field that chooses to stay above the keyboard.
 */
export const DIALOG_WINDOW_MARGIN = 16;

/** Below this a header, one row and a footer no longer fit; the dialog is not squeezed further. */
const SMALLEST = 240;

export function dialogMaxHeight(
  windowHeight: number,
  insets: { top: number; bottom: number },
  keyboardHeight = 0,
): number {
  const bottom = Math.max(insets.bottom, keyboardHeight);
  return Math.max(SMALLEST, windowHeight - insets.top - bottom - DIALOG_WINDOW_MARGIN);
}
