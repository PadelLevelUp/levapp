import { useEffect, useRef } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * The hardware / gesture back button on Android — mobile.android-runtime rule 3.
 *
 * Dialogs, selects and the two message menus live in Portals, not in a `Modal`,
 * so nothing closes them on back; the day sheet is a pan sheet with no modal at
 * all. This registry keeps every open transient surface in the order it opened
 * and hands one `hardwareBackPress` to the newest, which closes itself. With
 * nothing registered the event is left to the navigator (screen back). On iOS
 * the hook is inert: there is no back button and the registry never fires.
 */
export type BackRegistry = {
  /** Add the newest surface; returns its idempotent unregister. */
  register: (onBack: () => void) => () => void;
  /** Send one back press to the newest surface. True when one consumed it. */
  handle: () => boolean;
  size: () => number;
};

export function createBackRegistry(): BackRegistry {
  const stack: Array<{ onBack: () => void }> = [];
  return {
    register(onBack) {
      const entry = { onBack };
      stack.push(entry);
      return () => {
        const i = stack.indexOf(entry);
        if (i >= 0) stack.splice(i, 1);
      };
    },
    handle() {
      const top = stack[stack.length - 1];
      if (!top) return false;
      top.onBack();
      return true;
    },
    size: () => stack.length,
  };
}

/** The app-wide registry the hook below feeds; exported for the app root only. */
export const backRegistry = createBackRegistry();

let hardwareSubscription: { remove: () => void } | null = null;

/** One `hardwareBackPress` listener for the process; installed by the first surface. */
function ensureHardwareListener(): void {
  if (hardwareSubscription || Platform.OS !== "android") return;
  hardwareSubscription = BackHandler.addEventListener("hardwareBackPress", () =>
    backRegistry.handle()
  );
}

/**
 * Register `onBack` as the newest surface while `active` is true. Call it from
 * the content of a dialog / select / menu (rendered only while open) or from a
 * surface with an explicit open flag (the raised day sheet).
 */
export function useAndroidBack(active: boolean, onBack: () => void): void {
  // The latest closure runs, but the surface registers once per `active` so a
  // re-render never moves it above a surface that opened later.
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    if (!active || Platform.OS !== "android") return;
    ensureHardwareListener();
    return backRegistry.register(() => latest.current());
  }, [active]);
}
