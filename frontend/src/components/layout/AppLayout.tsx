import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Calendar,
  Users,
  LayoutDashboard,
  Settings,
  Menu,
  MessageSquare,
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

interface AppLayoutProps {
  children: ReactNode;
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Calendar, label: "Calendar", path: "/calendar" },
  { icon: Users, label: "Players", path: "/players" },
  { icon: MessageSquare, label: "Messages", path: "/messages" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const totalUnreadCount = useMemo(() => {
    return mockConversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
  }, []);

  const userInitials =
    user?.name
      ?.split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase() ??
    user?.username?.slice(0, 2).toUpperCase() ??
    "U";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
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
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/dashboard" &&
                location.pathname.startsWith(item.path));

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent text-sidebar-foreground"
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
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
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar text-sidebar-foreground transform transition-transform duration-300 md:hidden",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
          <Link
            to="/dashboard"
            className="flex items-center gap-3"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground font-bold text-sm">
                LU
              </span>
            </div>
            <span className="font-semibold text-lg">LevelUp</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(false)}
            className="text-sidebar-foreground"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent text-sidebar-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            <h1 className="text-lg font-semibold hidden sm:block">
              {navItems.find(
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
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
