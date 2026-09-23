import { useRootNavigationState, useRouter } from "expo-router";
import * as React from "react";

import { useAuth } from "@/auth/AuthContext";
import { subscribePushTaps, takeReadyPushTap } from "@/lib/push-tap-queue";

/**
 * Navigates to a tapped push's destination once it is safe to (B-166,
 * messaging.push-notifications rule 13): the root navigator is mounted and auth
 * has settled. Rendered inside `AuthProvider` next to the root `<Stack>`; a tap
 * offered before then waits in the queue, and a tap offered later wakes this
 * component through the queue's subscription. Renders nothing.
 */
export function PushTapRouter(): null {
  const router = useRouter();
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  const { loading, isAuthenticated } = useAuth();
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => subscribePushTaps(() => setTick((n) => n + 1)), []);

  React.useEffect(() => {
    const target = takeReadyPushTap({
      navigatorReady,
      authLoading: loading,
      signedIn: isAuthenticated,
    });
    if (!target) return;
    try {
      router.push(target as never);
    } catch (error) {
      console.warn("[push] tap routing failed", error);
    }
  }, [navigatorReady, loading, isAuthenticated, tick, router]);

  return null;
}
