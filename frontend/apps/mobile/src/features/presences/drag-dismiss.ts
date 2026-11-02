/**
 * PAD-818 (B-723, client.pull-to-refresh rule 5a): on Android a drag inside the validation sheet
 * puts the keyboard away, as `keyboardDismissMode="on-drag"` already does on iOS.
 *
 * On Android `on-drag` fires only when the ScrollView actually starts scrolling, and
 * `alwaysBounceVertical` is iOS-only: a list shorter than its box never scrolls, and a downward
 * drag at the top goes to the RefreshControl. So with one class expanded and the walk-in search
 * focused, a drag did nothing and Cancel and the answer row stayed under the keyboard. Here a
 * touch that moves past a small slop dismisses the keyboard, whether or not the list scrolls.
 * iOS gets no handlers and keeps `on-drag` as it was.
 */
import * as React from "react";
import { Keyboard, Platform } from "react-native";

/** Vertical travel, in points, after which a touch is a drag rather than a tap. */
export const DRAG_SLOP = 8;

export function movedPastSlop(startY: number | null, y: number, slop = DRAG_SLOP): boolean {
  return startY !== null && Math.abs(y - startY) > slop;
}

type TouchEvent = { nativeEvent: { pageY: number } };
export type DragDismissProps = {
  onTouchStart?: (e: TouchEvent) => void;
  onTouchMove?: (e: TouchEvent) => void;
};

/** The ScrollView touch props: none on iOS; on Android, one dismissal per touch past the slop. */
export function dragDismissHandlers(os: string, dismiss: () => void): DragDismissProps {
  if (os !== "android") return {};
  let startY: number | null = null;
  return {
    onTouchStart: (e) => {
      startY = e.nativeEvent.pageY;
    },
    onTouchMove: (e) => {
      if (movedPastSlop(startY, e.nativeEvent.pageY)) {
        startY = null;
        dismiss();
      }
    },
  };
}

export function useDragDismissKeyboard(): DragDismissProps {
  return React.useMemo(() => dragDismissHandlers(Platform.OS, () => Keyboard.dismiss()), []);
}
