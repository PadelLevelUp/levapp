import { useQuery } from "@tanstack/react-query";
import { Activity, Building2, ClipboardList, Home, LogOut, Settings, Shield, ToggleLeft, UserCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";

import { adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "./ui";
import { useIsPhone } from "@/lib/useIsPhone";
import { APPROVALS_KEY } from "@/pages/ApprovalsPage";
import { PhoneNav } from "./PhoneNav";
import { LanguagePicker, NavItems, SessionBlock, type NavItem } from "./ShellParts";

export function Shell() {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const phone = useIsPhone();
  const pending = useQuery({ queryKey: APPROVALS_KEY, queryFn: adminApi.coachApprovals, enabled: !!session });
  // A nav badge never takes the console down: any answer without a list counts as none.
  const pendingCount = Array.isArray(pending.data?.items) ? pending.data.items.length : 0;
  // The nine entries, shared by the desktop sidebar and the phone drawer.
  const items: NavItem[] = [
    { to: "/", icon: Home, label: t("admin.shell.nav.home"), end: true },
    { to: "/approvals", icon: UserCheck, label: t("admin.shell.nav.approvals"), count: pendingCount },
    { to: "/users", icon: Users, label: t("admin.shell.nav.users") },
    { to: "/settings", icon: Settings, label: t("admin.shell.nav.settings") },
    { to: "/roles", icon: Shield, label: t("admin.shell.nav.roles") },
    { to: "/audit", icon: ClipboardList, label: t("admin.shell.nav.audit") },
    { to: "/engine-health", icon: Activity, label: t("admin.shell.nav.engineHealth") },
    // PAD-533
    { to: "/clubs", icon: Building2, label: t("admin.shell.nav.clubs") },
    { to: "/switches", icon: ToggleLeft, label: t("admin.shell.nav.switches") },
  ];
  // admin.phone-console rule 2: one layout is rendered, never both hidden by CSS.
  if (phone) {
    return (
      <div className="flex min-h-screen flex-col">
        <PhoneNav items={items} session={session} onSignOut={() => void signOut()} title={t("admin.shell.title")} pendingCount={pendingCount} />
        <main className="min-w-0 flex-1 px-4 py-5">
          <Outlet />
        </main>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground" data-testid="admin-sidebar">
        <div className="px-5 py-5">
          <div className="font-display text-lg font-semibold">{t("admin.shell.title")}</div>
          <SessionBlock session={session} />
        </div>
        <nav className="flex-1 px-2">
          <NavItems items={items} />
        </nav>
        <div className="space-y-2 px-4 py-4">
          <LanguagePicker className="h-7" />
          <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => void signOut()} data-testid="admin-sign-out">
            <LogOut className="mr-2 h-4 w-4" />
            {t("admin.shell.signOut")}
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}
