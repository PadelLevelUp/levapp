import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { getUnreadMessagesCount } from "@/api/messages";

type ScrollMode = "page" | "none";

type LayoutContextValue = {

  scrollMode: ScrollMode;
  setScrollMode: (mode: ScrollMode) => void;

  bottomNavHidden: boolean;
  setBottomNavHidden: (hidden: boolean) => void;

  unreadCount: number;
  refreshUnreadCount: () => Promise<number>;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);

export function LayoutProvider({ children }: { children: React.ReactNode }) {

  const [scrollMode, setScrollMode] = useState<ScrollMode>("page");
  const [bottomNavHidden, setBottomNavHidden] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    const data = await getUnreadMessagesCount();
    const count = Number(data?.unreadCount ?? 0);
    setUnreadCount(count);
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
    }),
    [
      scrollMode,
      bottomNavHidden,
      unreadCount,
      refreshUnreadCount,
      sidebarCollapsed,
    ]
  );

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
  return ctx;
}
