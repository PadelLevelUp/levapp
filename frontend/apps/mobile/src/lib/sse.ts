import { buildEventsUrl } from "@levelup/api";
import * as React from "react";
import { AppState, type AppStateStatus } from "react-native";
import EventSource from "react-native-sse";
import { useAuth } from "@/auth/AuthContext";
import { secureTokenStorage } from "@/lib/api";
import { API_URL } from "@/lib/config";

/** Shape of a parsed SSE payload from GET /app/events. */
export type AppEvent = { type: string; [key: string]: unknown };

const INITIAL_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/**
 * Mobile counterpart of web's `createEventSource` (apps/web/src/api/events.ts),
 * backed by react-native-sse (React Native has no built-in EventSource).
 * Note: react-native-sse auto-reconnects every `pollingInterval` ms by
 * default; pass `{ pollingInterval: 0 }` to manage reconnection yourself.
 */
export function createEventsSource(token: string): EventSource {
  return new EventSource(buildEventsUrl(API_URL, token));
}

/**
 * Subscribes to the app event stream while a user is authenticated. Parses
 * each SSE payload as JSON and invokes `onEvent`. Reconnects on error with
 * exponential backoff (1s → 30s) and tears everything down on unmount or
 * logout.
 */
export function useAppEvents(onEvent: (evt: AppEvent) => void): void {
  const { isAuthenticated } = useAuth();

  // Keep the latest callback without re-opening the connection on re-renders.
  const onEventRef = React.useRef(onEvent);
  React.useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  React.useEffect(() => {
    if (!isAuthenticated) return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryMs = INITIAL_RETRY_MS;
    let cancelled = false;

    const teardown = () => {
      es?.removeAllEventListeners();
      es?.close();
      es = null;
    };

    const connect = async () => {
      const token = await secureTokenStorage.getToken().catch(() => null);
      if (cancelled || !token) return;

      // Own the reconnect loop (backoff) instead of the polyfill's fixed poll.
      es = new EventSource(buildEventsUrl(API_URL, token), {
        pollingInterval: 0,
      });

      es.addEventListener("open", () => {
        retryMs = INITIAL_RETRY_MS;
      });

      es.addEventListener("message", (event) => {
        if (!event.data) return;
        try {
          const data = JSON.parse(event.data) as AppEvent;
          if (data && typeof data.type === "string") {
            onEventRef.current(data);
          }
        } catch (error) {
          console.warn("[sse] invalid event payload", error);
        }
      });

      es.addEventListener("error", () => {
        teardown();
        if (cancelled) return;
        retryTimer = setTimeout(() => {
          void connect();
        }, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      });
    };

    void connect();

    // iOS suspends the JS runtime while the app is backgrounded. The socket
    // dies with it, but the "error" listener that would normally schedule a
    // retry — and the backoff timer itself — are frozen too, so on resume
    // nothing revives the stream: the app keeps rendering whatever it had
    // before backgrounding until a cold relaunch remounts this effect.
    // Reconnecting on every foreground transition closes that gap. Backoff is
    // reset because a resume is a fresh chance, not a continued failure.
    // Only a real background→active transition warrants this. iOS also emits
    // active→inactive→active without ever suspending the app (Control Centre,
    // a Face ID prompt, the app-switcher peek); reconnecting on those would
    // churn a perfectly healthy stream. That churn is not free: the server
    // holds each abandoned connection's thread until its q.get(timeout=15)
    // expires, on a backend pinned to one gunicorn worker (see the 2026-06-10
    // SSE outage), so a rapid churn transiently doubles thread usage.
    let previousState: AppStateStatus = AppState.currentState;
    const appStateSubscription = AppState.addEventListener("change", (status) => {
      const resumedFromBackground = previousState === "background";
      previousState = status;
      if (status !== "active" || cancelled || !resumedFromBackground) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      retryMs = INITIAL_RETRY_MS;
      teardown();
      void connect();
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      if (retryTimer) clearTimeout(retryTimer);
      teardown();
    };
  }, [isAuthenticated]);
}
