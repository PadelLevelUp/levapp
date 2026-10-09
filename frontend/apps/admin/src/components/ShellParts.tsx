import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import clsx from "clsx";

import type { AdminSession } from "@/lib/api";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { Badge, Select } from "./ui";

// Pieces shared by the desktop sidebar (Shell) and the phone drawer (PhoneNav), so the two
// layouts cannot drift apart (admin.phone-console rule 2).

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  end?: boolean;
  count?: number;
}

/** The nine links. The phone drawer passes `onNavigate` (close) and a `min-h-11` class. */
export function NavItems({ items, onNavigate, itemClassName }: { items: NavItem[]; onNavigate?: () => void; itemClassName?: string }) {
  return (
    <>
      {items.map(({ to, icon: Icon, label, end, count }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx("mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm", itemClassName, isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60")
          }
        >
          <Icon className="h-4 w-4" />
          <span className="flex-1">{label}</span>
          {count ? (
            // The phone top bar carries the one `admin-nav-approvals-count`; the drawer's pill has no id.
            <span className="rounded-full bg-sidebar-accent px-2 text-xs" data-testid={onNavigate ? undefined : "admin-nav-approvals-count"}>
              {count}
            </span>
          ) : null}
        </NavLink>
      ))}
    </>
  );
}

/** Session email, role badge and (for support) the read-only badge. */
export function SessionBlock({ session }: { session: AdminSession | null }) {
  const { t } = useTranslation();
  if (!session) return null;
  return (
    <>
      <div className="mt-2 truncate text-xs opacity-80" data-testid="admin-session-email">
        {session.email}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span data-testid="admin-session-role">
          <Badge tone="primary">{t(`admin.shell.role.${session.role}`)}</Badge>
        </span>
        {session.role === "support" ? <Badge>{t("admin.shell.readOnly")}</Badge> : null}
      </div>
    </>
  );
}

export function LanguagePicker({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-xs opacity-80">
      {t("admin.shell.language")}
      <Select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)} className={clsx("bg-sidebar-accent text-sidebar-foreground", className)}>
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng}>
            {lng.toUpperCase()}
          </option>
        ))}
      </Select>
    </label>
  );
}
