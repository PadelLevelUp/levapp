import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { getUnreadMessagesCount } from "@/api/messages";

type ScrollMode = "page" | "none";
type LatestMessageSummary = { sender: string; preview: string } | null;

type LayoutContextValue = {

  scrollMode: ScrollMode;
  setScrollMode: (mode: ScrollMode) => void;

  bottomNavHidden: boolean;
  setBottomNavHidden: (hidden: boolean) => void;

  unreadCount: number;
  refreshUnreadCount: () => Promise<number>;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;

  latestMessage: LatestMessageSummary;
  setLatestMessage: React.Dispatch<React.SetStateAction<LatestMessageSummary>>;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

/**
 * Mirror the unread total onto the installed-PWA app icon badge (PAD-153),
 * the web analogue of the iOS springboard badge.
 *
 * The Badging API only exists in an installed PWA on supporting browsers, so
 * every call is feature-detected and failure is swallowed — a browser that
 * cannot badge must never break the layout. `clearAppBadge` rather than
 * `setAppBadge(0)` for the empty case: 0 is specified to clear, but clearing
 * explicitly is what the API is for and avoids a "0" flashing on engines that
 * render it.
 */
function syncAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) {
      void nav.setAppBadge?.(count)?.catch(() => undefined);
    } else {
      void nav.clearAppBadge?.()?.catch(() => undefined);
    }
  } catch {
    // Unsupported browser — badging is strictly best-effort.
  }
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: React.ReactNode }) {

  const [scrollMode, setScrollMode] = useState<ScrollMode>("page");
  const [bottomNavHidden, setBottomNavHidden] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [latestMessage, setLatestMessage] = useState<LatestMessageSummary>(null);

  const refreshUnreadCount = useCallback(async () => {
    const data = await getUnreadMessagesCount();
    const count = Number(data?.unreadCount ?? 0);
    setUnreadCount(count);
    syncAppBadge(count);
    return count;
  }, []);

  const value = useMemo(
    () => ({
      scrollMode,
      setScrollMode,
      bottomNavHidden,
      setBottomNavHidden,
      unreadCount,
      refreshUnreadCount,
      setUnreadCount,
      sidebarCollapsed,
      setSidebarCollapsed,
      latestMessage,
      setLatestMessage,
    }),
    [
      scrollMode,
      bottomNavHidden,
      unreadCount,
      refreshUnreadCount,
      sidebarCollapsed,
      latestMessage,
      setLatestMessage,
    ]
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
  return ctx;
}
