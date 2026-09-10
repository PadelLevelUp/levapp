import * as Notifications from "expo-notifications";
import { useEffect } from "react";

export type BadgeSyncInput = {
  isAuthenticated: boolean;
  /** The unread-count query resolved at least once. */
  isSuccess: boolean;
  /** Server unread total from the latest successful fetch. */
  count: number;
  /** React Query's `dataUpdatedAt` — changes on every successful fetch. */
  dataUpdatedAt: number;
};

/**
 * Mirrors the unread total onto the iOS home-screen (springboard) badge —
 * messaging.push-notifications rule 6 (PAD-147 / PAD-153).
 *
 * Why `dataUpdatedAt` is a dependency: the badge has a second writer the app
 * cannot see — the `badge` field of an APNs payload, applied by iOS while the
 * app is closed or suspended. If the app then fetches the unread count and
 * gets the same number it already held (0 after the message was read on
 * another device; or a cold launch that opened the thread before the count
 * was ever observed), a count-only dependency list skips the write and the
 * stale badge lingers. Writing on every fresh answer — foreground refetch,
 * mark-read invalidation, first fetch of a cold launch — makes the icon equal
 * the server count at every observation, while re-renders without a new
 * fetch (same `dataUpdatedAt`) still write nothing.
 *
 * Never writes from a pending or failed fetch: until the query resolves the
 * count is a placeholder 0, and writing it would clear a legitimate badge on
 * every launch — permanently so when the device is offline (PAD-153). Logout
 * clears the badge in AuthContext.
 */
export function useAppBadgeSync({
  isAuthenticated,
  isSuccess,
  count,
  dataUpdatedAt,
}: BadgeSyncInput): void {
  useEffect(() => {
    if (!isAuthenticated || !isSuccess) return;
    void Notifications.setBadgeCountAsync(count).catch(() => undefined);
  }, [isAuthenticated, isSuccess, count, dataUpdatedAt]);
}
