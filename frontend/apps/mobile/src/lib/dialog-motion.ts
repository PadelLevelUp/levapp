import { Platform } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";

/**
 * Motion for the portal-rendered surfaces (dialog, alert dialog, select) —
 * B-089 / PAD-314.
 *
 * The fade-in is harmless everywhere. The fade-OUT is not: an exiting layout
 * animation deliberately keeps the native view alive after React has removed
 * the component, so that there is something left to animate. On Android, with
 * the content living in a portal whose entry disappears at the same moment,
 * that view is never removed — it stays drawn, with nothing behind it. It
 * answers no tap, consumes no back press, and only goes when the surface is
 * torn down. iOS shows none of it (verified on the simulator: the same dialog
 * closes in under a second), so iOS keeps its fade.
 *
 * Reanimated's own `LayoutAnimationConfig skipExiting` expresses the same
 * intent for a subtree; this is the one-line form for the three call sites.
 *
 * The mechanism above is the BEST-FITTING explanation, not a demonstrated one:
 * the fix changes the animation rather than instrumenting Fabric's mount, so
 * what is proven is that removing the exit animation removes the symptom, not
 * that the exit animation is what orphaned the view. Flow 49 guards the
 * behaviour either way.
 */
export const dialogEntering = () => FadeIn.duration(150);

export const dialogExiting = () =>
  Platform.OS === "ios" ? FadeOut.duration(150) : undefined;
