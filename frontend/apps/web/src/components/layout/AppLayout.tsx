import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  CalendarOff,
  CalendarPlus,
  Users,
  LayoutDashboard,
  Settings,
  Menu,
  MessageSquare,
  Dumbbell,
  ClipboardCheck,
  Database,
  X,
  ChevronLeft,
  ChevronRight,
  LogOut, Link2 } from "lucide-react";

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
import { useTranslation } from "react-i18next";
import { useAuth } from "@/auth/AuthContext";
import { useLayout } from "@/components/layout/LayoutContext";
import { subscribeAppEvents } from "@/api/events";

interface AppLayoutProps {
  children: ReactNode;
}

type NavItem = {
  icon: any;
  labelKey: string;
  path: string;
  roles: string[];
  superAdminOnly?: boolean;
};

const navItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    labelKey: "nav.dashboard",
    path: "/dashboard",
    roles: ["coach", "player"],
  },
  {
    icon: Calendar,
    labelKey: "nav.calendar",
    path: "/calendar",
    roles: ["coach", "player"],
  },
  {
    icon: Users,
    labelKey: "nav.players",
    path: "/players",
    roles: ["coach"],
  },
  {
    icon: Dumbbell,
    labelKey: "nav.training",
    path: "/training",
    roles: ["coach"],
  },
  {
    // PAD-140 — coach-only: the Presences tab exposes every roster player's
    // attendance, which students must never see (classes.detail-visibility).
    icon: ClipboardCheck,
    labelKey: "nav.presences",
    path: "/presences",
    roles: ["coach"],
  },
  {
    icon: CalendarOff,
    labelKey: "nav.availability",
    path: "/availability",
    roles: ["player"],
  },
  {
    // PAD-104: students book from Availability; the coach answers here.
    icon: CalendarPlus,
    labelKey: "nav.classRequests",
    path: "/class-requests",
    roles: ["coach"],
  },
  {
    icon: MessageSquare,
    labelKey: "nav.messages",
    path: "/messages",
    roles: ["coach", "player"],
  },
  {
    icon: Settings,
    labelKey: "nav.settings",
    path: "/settings",
    // PAD-112: students now have something of their own in Settings (their
    // notification block preferences), so the entry can no longer be
    // coach-only. `/settings` was already reachable for them — the route is a
    // bare ProtectedRoute and the avatar dropdown links there for everyone —
    // it just wasn't discoverable, which would have made the new section
    // effectively unreachable.
    roles: ["coach", "player"],
  },
  // The /editor route still exists and is reachable directly — it is just not
  // a nav destination. It is a superadmin data browser, not one of the coach's
  // tools, and it was sitting in the same list as Calendar and Players.
];

// PAD-149. This used to mount a SECOND LayoutProvider around AppLayoutInner,
// nested inside the one App.tsx already wraps the whole router in. Two
// providers meant two independent `useState` copies of the layout state, and
// which one a component saw depended on whether it sat above or below this
// boundary:
//
//   - MessagesPage and DashboardPage call useLayout() at their own top level
//     and RENDER <AppLayout>, so they wrote to the OUTER provider;
//   - AppLayoutInner — which draws the unread badge and applies scrollMode —
//     read from the INNER one, which nothing refreshed after its mount effect.
//
// So MessagesPage's refreshUnreadCount() correctly POSTed the read, correctly
// got {"unreadCount": 0} back, and set a count nothing rendered: the nav badge
// stayed stale until a route change remounted this component. That is the
// PAD-149 defect. It also silently dropped DashboardPage's setUnreadCount /
// setLatestMessage and MessagesPage's setScrollMode("none") — the latter had
// never once taken effect. (Composer's setBottomNavHidden worked only because
// Composer happens to render below this boundary.)
//
// App.tsx's provider wraps <BrowserRouter> and every route, so one provider is
// enough and every consumer now shares it.
export function AppLayout({ children }: AppLayoutProps) {
  return <AppLayoutInner>{children}</AppLayoutInner>;
}

export function AppLayoutInner({ children }: AppLayoutProps) {
  const { unreadCount: totalUnreadCount, refreshUnreadCount, scrollMode, bottomNavHidden } = useLayout();

  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, token } = useAuth();
  const { t } = useTranslation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNavItems = navItems.filter(item => {
    if (item.superAdminOnly) return user?.isSuperAdmin === true;
    return item.roles.some(role => user?.roles.includes(role));
  });

  // PAD-183: Settings is dropped from the mobile bottom nav only — at 390px
  // wide, seven (coach) or five (student) tabs with Portuguese labels overflow
  // the bar (measured scrollWidth 428 vs clientWidth 390). Settings is
  // redundant there anyway: the avatar menu in the header already links to it
  // on every viewport. The desktop sidebar keeps using `visibleNavItems`
  // unfiltered, so this has no effect above the `md` breakpoint.
  // PAD-104: the coach's class-requests inbox also stays off the bar (PAD-183's 390px budget);
  // it is still in the desktop sidebar and the mobile drawer.
  const mobileNavItems = visibleNavItems.filter(
    item => item.path !== "/settings" && item.path !== "/class-requests",
  );

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

    // messaging.sse-realtime rule 15 (PAD-277): the tab's one shared stream,
    // which also reconnects — this effect used to close for good on any error.
    return subscribeAppEvents(token, (data) => {
      // When viewing a specific conversation, MessagesPage marks it read first
      // then calls refreshUnreadCount — avoid racing with it here.
      if (data.type === "message_created" && !/^\/messages\/.+/.test(location.pathname)) {
        void refreshUnreadCount();
      }
    });
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
        {/* Brand. The sidebar is navy chrome, so both marks are the on-dark
            variants. The wordmark is outlined type, not live text — it carries
            its own "Lev"/"App" two-tone and must never be recoloured.

            `data-launch-logo` marks this as a landing site for the login
            animation, which flies its mark onto whichever of these is visible
            (see components/brand/launch-loader.tsx). The value names the asset
            so the loader knows where the mark sits inside it: a lockup is
            mostly wordmark, a bare mark carries a keyline. */}
        <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5"
            aria-label="LevApp"
          >
            {sidebarCollapsed ? (
              <img
                src="/brand/levapp-mark-on-dark.svg"
                alt=""
                aria-hidden="true"
                data-launch-logo="mark"
                className="h-7 w-auto shrink-0"
              />
            ) : (
              // The lockup, not two images side by side — it carries the
              // mark/wordmark alignment the design system intends.
              <img
                src="/brand/levapp-lockup-on-dark.svg"
                alt=""
                aria-hidden="true"
                data-launch-logo="lockup"
                className="h-8 w-auto"
              />
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
                  // Selected is a FILLED SHAPE, not a colour swap: the raised
                  // navy carries the selection and the blue label carries the
                  // emphasis. A full-width bright-blue bar reads as a button —
                  // blue is reserved for actions, and the nav is not one.
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                    : "hover:bg-sidebar-accent/60 text-sidebar-foreground"
                )}
              >
                <div className="relative shrink-0">
                  <item.icon className="w-5 h-5 shrink-0" />
                  {showBadge && (
                    // PAD-149: the badge is a bare span, so a test could only
                    // assert on the Link's text — which itself changes as the
                    // badge changes. Name the element instead.
                    <span
                      data-testid="nav-unread-badge"
                      className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center px-1"
                    >
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </span>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">{t(item.labelKey)}</span>
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
        data-testid="mobile-bottom-nav"
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-2 z-50 transition-transform duration-200",
          bottomNavHidden ? "translate-y-full" : "translate-y-0"
        )}
      >
        {mobileNavItems.map((item) => {
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
              {/* The active destination gets a filled wash behind its icon —
                  a shape, not just a colour swap, so it reads at a glance. */}
              <div
                className={cn(
                  "relative flex items-center justify-center rounded-lg px-3 py-0.5 transition-colors",
                  isActive && "bg-secondary"
                )}
              >
                <item.icon className="w-5 h-5" />
                {showBadge && (
                  // PAD-149: same count, second render site (see rule 7).
                  <span
                    data-testid="bottom-nav-unread-badge"
                    className="absolute -top-1 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-destructive text-destructive-foreground text-[9px] font-medium flex items-center justify-center px-0.5"
                  >
                    {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                  </span>
                )}
              </div>
              <span className={cn("text-[10px]", isActive ? "font-semibold" : "font-medium")}>
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="md:flex md:h-16 h-12 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            {/* Below `sm` the page title is hidden and the header was empty, so
                the phone had no branding at all. The mark is a static SVG and
                cannot adapt to the theme, so both variants ship and CSS picks:
                the header is a white card in light and navy in dark. */}
            <Link to="/dashboard" className="sm:hidden" aria-label="LevApp">
              <img
                src="/brand/levapp-mark-on-light.svg"
                alt=""
                aria-hidden="true"
                data-launch-logo="mark"
                className="h-6 w-auto dark:hidden"
              />
              <img
                src="/brand/levapp-mark-on-dark.svg"
                alt=""
                aria-hidden="true"
                data-launch-logo="mark"
                className="hidden h-6 w-auto dark:block"
              />
            </Link>
            <h1 className="text-lg font-semibold hidden sm:block">
              {(() => {
                const active = visibleNavItems.find(
                  (item) =>
                    location.pathname === item.path ||
                    (item.path !== "/dashboard" &&
                      location.pathname.startsWith(item.path))
                );
                return active ? t(active.labelKey) : t("nav.appName");
              })()}
            </h1>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2"
                data-testid="user-menu-trigger"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden sm:inline text-sm font-medium">
                  {user?.name ?? user?.username}
                </span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => navigate("/settings")}
                data-testid="user-menu-settings"
              >
                <Settings className="w-4 h-4 mr-2" />
                {t("nav.settings")}
              </DropdownMenuItem>

              {/* PAD-287: straight to the My connections section (settings.role-scope rule 2). */}
              <DropdownMenuItem
                onClick={() => navigate("/settings?tab=connections")}
                data-testid="user-menu-connections"
              >
                <Link2 className="w-4 h-4 mr-2" />
                {t("settings.nav.connections")}
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
                {t("nav.logout")}
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
