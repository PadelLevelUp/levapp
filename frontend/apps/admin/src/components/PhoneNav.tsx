import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import clsx from "clsx";

import type { AdminSession } from "@/lib/api";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import type { NavItem } from "./Shell";
import { Badge, Button, Select } from "./ui";

interface Props {
  items: NavItem[];
  session: AdminSession | null;
  onSignOut: () => void;
  title: string;
  pendingCount: number;
}

// admin.phone-console rule 2: below `md` the sidebar is replaced by a top bar and a drawer
// carrying the same nine items, the session block, the language picker and sign-out.
export function PhoneNav({ items, session, onSignOut, title, pendingCount }: Props) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between bg-sidebar px-4 text-sidebar-foreground" data-testid="admin-topbar">
        <div className="font-display text-lg font-semibold">{title}</div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <span className="rounded-full bg-sidebar-accent px-2 text-xs" data-testid="admin-nav-approvals-count">
              {pendingCount}
            </span>
          ) : null}
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-sidebar-accent"
            aria-label={t("admin.shell.menu")}
            onClick={() => setOpen(true)}
            data-testid="admin-menu-button"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>
      {open ? (
        <>
          <div className="fixed inset-0 z-30 bg-black/40" onClick={close} data-testid="admin-menu-backdrop" />
          <nav
            role="dialog"
            aria-modal="true"
            aria-label={t("admin.shell.menu")}
            className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-y-auto bg-sidebar text-sidebar-foreground"
            data-testid="admin-nav-drawer"
          >
            <div className="flex items-center justify-between px-4 py-2">
              <div className="font-display text-lg font-semibold">{title}</div>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-sidebar-accent"
                aria-label={t("admin.shell.closeMenu")}
                onClick={close}
                data-testid="admin-menu-close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 px-2">
              {items.map(({ to, icon: Icon, label, end, count }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={close}
                  className={({ isActive }) =>
                    clsx("mb-1 flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm", isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{label}</span>
                  {count ? <span className="rounded-full bg-sidebar-accent px-2 text-xs">{count}</span> : null}
                </NavLink>
              ))}
            </div>
            <div className="space-y-2 px-4 py-4">
              {session ? (
                <div className="truncate text-xs opacity-80" data-testid="admin-session-email">
                  {session.email}
                </div>
              ) : null}
              {session ? (
                <div className="flex items-center gap-2">
                  <Badge tone="primary">{t(`admin.shell.role.${session.role}`)}</Badge>
                  {session.role === "support" ? <Badge>{t("admin.shell.readOnly")}</Badge> : null}
                </div>
              ) : null}
              <label className="flex items-center gap-2 text-xs opacity-80">
                {t("admin.shell.language")}
                <Select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)} className="bg-sidebar-accent text-sidebar-foreground">
                  {SUPPORTED_LANGUAGES.map((lng) => (
                    <option key={lng} value={lng}>
                      {lng.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </label>
              <Button variant="ghost" className="min-h-11 w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={onSignOut} data-testid="admin-sign-out">
                <LogOut className="mr-2 h-4 w-4" />
                {t("admin.shell.signOut")}
              </Button>
            </div>
          </nav>
        </>
      ) : null}
    </>
  );
}
