import * as React from "react";
import { Keyboard } from "react-native";

const nextFrame = (f: () => void) =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => f()) : setTimeout(f, 0);

/**
 * mobile.android-runtime rule 2 (PAD-487, B-265): the handler a form's LAST field calls on focus.
 * Once the keyboard is up (and the keyboard view has shrunk the form), the form scrolls to its
 * end, so that field sits above the keyboard. A KeyboardAvoidingView only shrinks the view; the
 * ScrollView inside keeps its offset, so a field near the bottom stays where the keyboard now is.
 * If the keyboard is already up (focus moved from another field), it scrolls at once.
 */
export function useScrollToEndOnKeyboard(scrollToEnd: () => void): () => void {
  const pending = React.useRef(false);
  const latest = React.useRef(scrollToEnd);
  latest.current = scrollToEnd;

  React.useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (!pending.current) return;
      pending.current = false;
      // A frame later: the shrink has laid out by then (the same deferral the chat uses).
      nextFrame(() => latest.current());
    });
    return () => sub.remove();
  }, []);

  return React.useCallback(() => {
    const keyboard = Keyboard as { isVisible?: () => boolean };
    if (keyboard.isVisible?.()) {
      nextFrame(() => latest.current());
      return;
    }
    pending.current = true;
  }, []);
}
