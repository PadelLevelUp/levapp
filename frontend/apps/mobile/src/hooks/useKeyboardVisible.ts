import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * True while the on-screen keyboard is up.
 *
 * iOS gets the `will` events so dependent layout changes ride the same
 * animation as the keyboard itself rather than snapping a frame late; Android
 * only ever fires the `did` pair.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}
