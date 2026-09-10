import {
  buildEventsUrl,
  createSseHub,
  type SseHub,
  type SseSourceLike,
} from "@levelup/api";
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import EventSource from "react-native-sse";
import { useAuth } from "@/auth/AuthContext";
import { secureTokenStorage } from "@/lib/api";
import { API_URL } from "@/lib/config";

/** Shape of a parsed SSE payload from GET /app/events. */
export type AppEvent = { type: string; [key: string]: unknown };

/**
 * messaging.sse-realtime rule 15 (PAD-277): ONE stream per app.
 *
 * Every open stream holds one of the backend's 64 gunicorn threads, and three
 * screens (the tabs layout, the class screen and the conversation screen) each
 * used to open their own. They all go through `useAppEvents`, which now
 * subscribes to a single module-level hub from `@levelup/api`: one
 * react-native-sse connection, fanned out to every mounted screen, with
 * exponential back-off and jitter (debug-level log only) owned by the hub.
 */
let sharedHub: SseHub | null = null;

function appEventsHub(): SseHub {
  if (sharedHub) return sharedHub;
  const hub = createSseHub({
    // Read at every (re)connect, so a new sign-in streams as the new user.
    getUrl: async () => {
      const token = await secureTokenStorage.getToken().catch(() => null);
      return token ? buildEventsUrl(API_URL, token) : null;
    },
    // `pollingInterval: 0` — the hub owns reconnection, not the polyfill.
    // react-native-sse's listener typing is generic per event name; the hub
    // only needs open / message / error and close().
    open: (url) =>
      new EventSource(url, { pollingInterval: 0 }) as unknown as SseSourceLike,
  });

  // iOS suspends the JS runtime while the app is backgrounded. The socket
  // dies with it, but the "error" listener that would normally schedule a
  // retry — and the backoff timer itself — are frozen too, so on resume
  // nothing revives the stream: the app keeps rendering whatever it had
  // before backgrounding until a cold relaunch. Reconnecting on every
  // foreground transition closes that gap, with the back-off reset.
  // Only a real background→active transition warrants this. iOS also emits
  // active→inactive→active without ever suspending the app (Control Centre,
  // a Face ID prompt, the app-switcher peek); reconnecting on those would
  // churn a perfectly healthy stream, and each abandoned connection holds a
  // server thread until its keep-alive notices (the 2026-06-10 SSE outage).
  // One listener for the whole app, since there is one stream.
  let previousState: AppStateStatus = AppState.currentState;
  AppState.addEventListener("change", (status) => {
    const resumedFromBackground = previousState === "background";
    previousState = status;
    if (status === "active" && resumedFromBackground) hub.reconnectNow();
  });

  sharedHub = hub;
  return hub;
}

/**
 * Subscribes to the app event stream while a user is authenticated and
 * invokes `onEvent` with each parsed event. Every caller shares the one
 * connection; it closes when the last caller unmounts or on logout.
 */
export function useAppEvents(onEvent: (evt: AppEvent) => void): void {
  const { isAuthenticated } = useAuth();

  // Keep the latest callback without re-subscribing on re-renders.
  const onEventRef = React.useRef(onEvent);
  React.useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    if (!isAuthenticated) return;
    return appEventsHub().subscribe((evt) => onEventRef.current(evt as AppEvent));
  }, [isAuthenticated]);
}
