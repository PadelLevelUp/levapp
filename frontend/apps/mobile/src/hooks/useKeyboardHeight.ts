import { useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from "react-native";

/**
 * PAD-838: how much of the window the on-screen keyboard covers, in points; 0 while it is down.
 *
 * Same events as `useKeyboardVisible` (iOS `will`, so layout rides the keyboard's own animation;
 * Android only has `did`), plus iOS's `keyboardWillChangeFrame`: the predictive bar or a switch
 * to the number pad changes the keyboard's height without a new show event.
 *
 * The overlap is measured from the keyboard's top edge (`screenY`), not its `height`, so a
 * keyboard that does not reach the window's bottom counts only where it covers the window.
 * The result is relative to the WINDOW's bottom: callers that draw over the full window
 * (the shared dialog's overlay) can use it as is.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === "ios";
    const cover = (e: KeyboardEvent) =>
      setHeight(Math.max(0, Dimensions.get("window").height - e.endCoordinates.screenY));
    const subs = [
      Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", cover),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => setHeight(0)),
      ...(ios ? [Keyboard.addListener("keyboardWillChangeFrame", cover)] : []),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  return height;
}
