import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import * as React from "react";

import { useAuth } from "@/auth/AuthContext";
import { subscribePushTaps, takeReadyPushTap } from "@/lib/push-tap-queue";

/**
 * Navigates to a tapped push's destination once it is safe to (B-166,
 * messaging.push-notifications rule 13): the root navigator is mounted, auth
 * has settled, and the launch gate (`app/index.tsx`, which `<Redirect>`s to the
 * post-login screen or to login) has already moved on. A push issued while the
 * gate is still the current route is REPLACED by its redirect — measured on the
 * simulator: auth settles in the same commit the gate renders its Redirect. Rendered inside `AuthProvider` next to the root `<Stack>`; a tap
 * offered before then waits in the queue, and a tap offered later wakes this
 * component through the queue's subscription. Renders nothing.
 */
export function PushTapRouter(): null {
  const router = useRouter();
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  const pathname = usePathname();
  const pastLaunchGate = pathname !== "/";
  const { loading, isAuthenticated } = useAuth();
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => subscribePushTaps(() => setTick((n) => n + 1)), []);

  React.useEffect(() => {
    const target = takeReadyPushTap({
      navigatorReady,
      pastLaunchGate,
      authLoading: loading,
      signedIn: isAuthenticated,
    });
    if (!target) return;
    try {
      router.push(target as never);
    } catch (error) {
      console.warn("[push] tap routing failed", error);
    }
  }, [navigatorReady, pastLaunchGate, loading, isAuthenticated, tick, router]);

  return null;
}
