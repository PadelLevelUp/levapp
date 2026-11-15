/**
 * PAD-496: how tall a dialog may be. The dialog overlay centres its content in the whole
 * window, so a dialog taller than the window loses its title above the screen and its footer
 * below it, and neither can be reached. Bound like this, a dialog with a list in it shrinks the
 * list instead (the list must be allowed to: `flexShrink: 1`), and its header and footer stay
 * on screen.
 *
 * The bound is symmetric: the larger of the two safe areas (notch, home indicator) is left free
 * at BOTH ends, because the dialog is centred; subtracting each once would let a full-height
 * dialog start inside the larger one. The overlay's own margin comes off as well.
 *
 * PAD-838: with the keyboard up the dialog is centred in what is left above it (the overlay is
 * padded by the keyboard's overlap), so the bound is that space: the keyboard replaces the bottom
 * safe area, and the top one is left free at both ends for the same centring reason.
 */
export const DIALOG_WINDOW_MARGIN = 16;

/** Below this a header, one row and a footer no longer fit; the dialog is not squeezed further. */
const SMALLEST = 240;

export function dialogMaxHeight(
  windowHeight: number,
  insets: { top: number; bottom: number },
  keyboardHeight = 0
): number {
  const free =
    keyboardHeight > 0
      ? windowHeight - keyboardHeight - 2 * insets.top
      : windowHeight - 2 * Math.max(insets.top, insets.bottom);
  return Math.max(SMALLEST, free - DIALOG_WINDOW_MARGIN);
}
