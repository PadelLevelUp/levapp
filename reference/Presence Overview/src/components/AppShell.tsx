import type { ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ClipboardCheck,
  Dumbbell,
  MessageSquare,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Dashboard", icon: LayoutDashboard, active: false },
  { label: "Calendar", icon: CalendarDays, active: false },
  { label: "Players", icon: Users, active: false },
  { label: "Presences", icon: ClipboardCheck, active: true },
  { label: "Exercises", icon: Dumbbell, active: false },
  { label: "Chat", icon: MessageSquare, active: false },
  { label: "Definitions", icon: Settings, active: false },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={onNavigate}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            item.active
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-6 py-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        P
      </span>
      <span className="text-sm font-semibold tracking-tight text-foreground">PadelCoach</span>
    </div>
  );
}

function ProfileMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm transition-colors hover:bg-muted">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="bg-accent text-xs text-accent-foreground">TP</AvatarFallback>
        </Avatar>
        <span className="hidden font-medium text-foreground sm:inline">Tomas P.</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Coach account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem>Preferences</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
        <Brand />
        <NavList />
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              P
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">Presences</span>
          </div>
          <span className="hidden text-sm font-medium text-muted-foreground lg:block">Presences</span>
          <div className="ml-auto">
            <ProfileMenu />
          </div>
        </header>
        <div className="pb-20 lg:pb-0">{children}</div>
      </div>

      {/* Mobile bottom nav — horizontally scrollable for >5 tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="flex snap-x snap-mandatory gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => (
            <button
              key={item.label}
              type="button"
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex min-w-[4.5rem] shrink-0 snap-start flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors",
                item.active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground active:bg-muted",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent" />
      </nav>
    </div>
  );
}
