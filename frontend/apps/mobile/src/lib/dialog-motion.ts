import { Platform } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";

/**
 * Motion for the portal-rendered surfaces (dialog, alert dialog, select):
 * B-089 / PAD-314, `mobile.android-runtime` rule 9.
 *
 * Android gets NO layout animation on these surfaces, in either direction;
 * iOS keeps a 150 ms fade both ways (verified on the simulator).
 *
 * Exit (face A, PR #251): an exiting layout animation keeps the native view
 * alive after React has removed the component, so there is something left to
 * animate. On Android, with the content in a portal whose entry disappears at
 * the same moment, that view was never removed: drawn, inert, and not answering
 * back. What is proven is that removing the exit animation removes the symptom
 * (flow 49, red before and green after); the orphaning mechanism is inferred.
 *
 * Entering (face B): measured, not inferred. On the emulator lane, with a
 * mount/layout trace, the overlap confirmation opened with its overlay drawn,
 * its content mounted and laid out at full size, and the entering animation
 * reporting `finished: true` 5 ms after mount. Yet the content node was "not
 * visible to user" at its exact bounds, i.e. still at opacity 0 (run
 * 35114681841, iteration 1; the keyboard's inset animation was being
 * force-finished at the same instant). The same build without the entering
 * animation passed 60 of 60 (run 35114685284). So the animation can end
 * without ever taking the content to opacity 1, and there is no later frame
 * that would.
 *
 * Reanimated's `LayoutAnimationConfig skipEntering skipExiting` expresses the
 * same intent for a subtree; this is the one-line form for the three call sites.
 */
export const dialogEntering = () =>
  Platform.OS === "ios" ? FadeIn.duration(150) : undefined;

export const dialogExiting = () =>
  Platform.OS === "ios" ? FadeOut.duration(150) : undefined;
