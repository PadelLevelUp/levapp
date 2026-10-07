import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Home, LogOut, Settings, Shield, UserCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";

import { adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { Badge, Button, Select } from "./ui";

export function Shell() {
  const { t, i18n } = useTranslation();
  const { session, signOut } = useAuth();
  const pending = useQuery({ queryKey: ["admin", "coach-approvals"], queryFn: adminApi.coachApprovals, enabled: !!session });
  const pendingCount = pending.data?.items.length ?? 0;
  const items = [
    { to: "/", icon: Home, label: t("admin.shell.nav.home"), end: true },
    { to: "/approvals", icon: UserCheck, label: t("admin.shell.nav.approvals"), count: pendingCount },
    { to: "/users", icon: Users, label: t("admin.shell.nav.users") },
    { to: "/settings", icon: Settings, label: t("admin.shell.nav.settings") },
    { to: "/roles", icon: Shield, label: t("admin.shell.nav.roles") },
    { to: "/audit", icon: ClipboardList, label: t("admin.shell.nav.audit") },
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground" data-testid="admin-sidebar">
        <div className="px-5 py-5">
          <div className="font-display text-lg font-semibold">{t("admin.shell.title")}</div>
          {session ? (
            <div className="mt-2 truncate text-xs opacity-80" data-testid="admin-session-email">
              {session.email}
            </div>
          ) : null}
          {session ? (
            <div className="mt-2 flex items-center gap-2">
              <Badge tone="primary">{t(`admin.shell.role.${session.role}`)}</Badge>
              {session.role === "support" ? <Badge>{t("admin.shell.readOnly")}</Badge> : null}
            </div>
          ) : null}
        </div>
        <nav className="flex-1 px-2">
          {items.map(({ to, icon: Icon, label, end, count }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx("mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm", isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {count ? (
                <span className="rounded-full bg-sidebar-accent px-2 text-xs" data-testid="admin-nav-approvals-count">
                  {count}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-2 px-4 py-4">
          <label className="flex items-center gap-2 text-xs opacity-80">
            {t("admin.shell.language")}
            <Select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)} className="h-7 bg-sidebar-accent text-sidebar-foreground">
              {SUPPORTED_LANGUAGES.map((lng) => (
                <option key={lng} value={lng}>
                  {lng.toUpperCase()}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => void signOut()} data-testid="admin-sign-out">
            <LogOut className="mr-2 h-4 w-4" />
            {t("admin.shell.signOut")}
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
