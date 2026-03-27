import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  Users,
  LayoutDashboard,
  Settings,
  Menu,
  MessageSquare,
  Dumbbell,
  Database,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/auth/AuthContext";
import { LayoutProvider, useLayout } from "@/components/layout/LayoutContext";
import { createEventSource } from "@/api/events";

interface AppLayoutProps {
  children: ReactNode;
}

type NavItem = {
  icon: any;
  label: string;
  path: string;
  roles: string[];
  superAdminOnly?: boolean;
};

const navItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/dashboard",
    roles: ["coach", "player"],
  },
  {
    icon: Calendar,
    label: "Calendar",
    path: "/calendar",
    roles: ["coach", "player"],
  },
  {
    icon: Users,
    label: "Players",
    path: "/players",
    roles: ["coach"],
  },
  {
    icon: Dumbbell,
    label: "Training",
    path: "/training",
    roles: ["coach"],
  },
  {
    icon: MessageSquare,
    label: "Messages",
    path: "/messages",
    roles: ["coach", "player"],
  },
  {
    icon: Settings,
    label: "Settings",
    path: "/settings",
    roles: ["coach"],
  },
  {
    icon: Database,
    label: "Editor",
    path: "/editor",
    roles: ["coach", "player"],
    superAdminOnly: true,
  },
];

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <LayoutProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </LayoutProvider>
  );
}

export function AppLayoutInner({ children }: AppLayoutProps) {
  const { unreadCount: totalUnreadCount, refreshUnreadCount, scrollMode, bottomNavHidden } = useLayout();

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNavItems = navItems.filter(item => {
    if (item.superAdminOnly) return user?.isSuperAdmin === true;
    return item.roles.some(role => user?.roles.includes(role));
  });

  const userInitials =
    user?.name
      ?.split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase() ??
    user?.username?.slice(0, 2).toUpperCase() ??
    "U";

  useEffect(() => {
    void refreshUnreadCount().catch((e) => {
      console.warn("refreshUnreadCount failed", e);
    });
  }, [refreshUnreadCount]);

  useEffect(() => {
    if (!token) return;

    const es = createEventSource(token);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // When viewing a specific conversation, MessagesPage marks it read first
        // then calls refreshUnreadCount — avoid racing with it here.
        if (data?.type === "message_created" && !/^\/messages\/.+/.test(location.pathname)) {
          void refreshUnreadCount();
        }
      } catch (error) {
        console.warn("Invalid SSE message payload", error);
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [refreshUnreadCount, token]);
  
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground font-bold text-sm">
                LU
              </span>
            </div>
            {!sidebarCollapsed && (
              <span className="font-semibold text-lg">LevelUp</span>
            )}
          </Link>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 p-3 space-y-1">
          {visibleNavItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/dashboard" &&
                location.pathname.startsWith(item.path));

            const isMessages = item.path === '/messages';
            const showBadge = isMessages && totalUnreadCount > 0;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent text-sidebar-foreground"
                )}
              >
                <div className="relative shrink-0">
                  <item.icon className="w-5 h-5 shrink-0" />
                  {showBadge && (
                    <span className={cn(
                      "absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center px-1",
                      isActive && "bg-sidebar-primary-foreground text-sidebar-primary"
                    )}>
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </span>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full justify-center text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-foreground/50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-2 z-50 transition-transform duration-200",
          bottomNavHidden ? "translate-y-full" : "translate-y-0"
        )}
      >
        {visibleNavItems.map((item) => {
          const isActive =
            location.pathname === item.path ||
            (item.path !== "/dashboard" &&
              location.pathname.startsWith(item.path));

          const isMessages = item.path === "/messages";
          const showBadge = isMessages && totalUnreadCount > 0;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 px-3 rounded-lg transition-colors min-w-[60px] relative",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <item.icon className="w-5 h-5" />
                {showBadge && (
                  <span className="absolute -top-1 -right-1.5 min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-medium flex items-center justify-center px-0.5">
                    {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="md:flex md:h-16 h-12 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold hidden sm:block">
              {visibleNavItems.find(
                (item) =>
                  location.pathname === item.path ||
                  (item.path !== "/dashboard" &&
                    location.pathname.startsWith(item.path))
              )?.label || "LevelUp"}
            </h1>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2">
                <Avatar className="w-8 h-8">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium">
                  {user?.name ?? user?.username}
                </span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  logout();
                  navigate("/auth");
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Page Content */}
        <main
          className={cn(
            "flex-1 min-h-0 md:pb-0",
            scrollMode === "page" ? "overflow-auto" : "overflow-hidden",
            bottomNavHidden
              ? "pb-[env(safe-area-inset-bottom)]"
              : "pb-[calc(4rem+env(safe-area-inset-bottom))]"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
