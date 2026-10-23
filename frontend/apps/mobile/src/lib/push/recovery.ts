import { AppState, type AppStateStatus } from "react-native";

import type { PushRegistrar } from "./types";

type AppStateSubscribe = (listener: (status: AppStateStatus) => void) => { remove(): void };

const subscribeToAppState: AppStateSubscribe = (listener) => AppState.addEventListener("change", listener);

/**
 * messaging.push-notifications rule 15 (PAD-744): while signed in, a return to the foreground
 * registers without a prompt unless this session already has, so a permission granted in Settings
 * takes effect, and a rotated push token is sent. Returns the function that stops both (sign-out).
 */
export function startPushRecovery(registrar: PushRegistrar, onAppState: AppStateSubscribe = subscribeToAppState): () => void {
  const appState = onAppState((status) => {
    if (status === "active" && registrar.status() !== "registered") void registrar.registerIfPermitted();
  });
  const stopRotation = registrar.watchTokenRotation();
  return () => {
    appState.remove();
    stopRotation();
  };
}
