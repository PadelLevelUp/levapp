/**
 * PAD-769 (messaging.conversation-detail rule 19): a short haptic when a message is chosen for a
 * reply.
 *
 * The native module comes with `expo-haptics` (a dependency so autolinking builds it into the
 * next store binary), but the app ships over the air on `runtimeVersion: appVersion`: this JS also
 * runs on 1.1.2 binaries built without it. So the module is looked up with
 * `requireOptionalNativeModule` (expo-modules-core, as `expo` itself re-exports it), which answers
 * null there instead of throwing, and every call is a
 * silent no-op on a binary without it. Nothing here imports `expo-haptics` itself. iOS plays it only
 * when the user's system haptics are on.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

type HapticsModule = { impactAsync?: (style: "light" | "medium" | "heavy") => Promise<void> };

let module: HapticsModule | null | undefined;

function haptics(): HapticsModule | null {
  if (module === undefined) module = requireOptionalNativeModule<HapticsModule>("ExpoHaptics");
  return module;
}

/** One light tap; never throws, never waits. */
export function lightImpact(): void {
  const native = haptics();
  if (!native?.impactAsync) return;
  native.impactAsync("light").catch(() => {});
}

/** Test seam: forget the looked-up module. */
export function resetHapticsForTest(): void {
  module = undefined;
}
