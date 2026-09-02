import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardKpiGridBlock, DashboardIcon } from "@/types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Users,
  Calendar,
  ClipboardCheck,
  TrendingUp,
  UserPlus,
  CheckCircle2,
  XCircle,
  Mail,
  HelpCircle,
} from "lucide-react";

const iconMap: Record<DashboardIcon, React.ComponentType<{ className?: string }>> = {
  users: Users,
  calendar: Calendar,
  clipboard_check: ClipboardCheck,
  trending_up: TrendingUp,
  user_plus: UserPlus,
check_circle: CheckCircle2,
  x_circle: XCircle,
  mail: Mail,
};

/** "Upcoming lessons" → "upcoming-lessons" — stable key for dashboard-kpi-<key>. */
function kpiKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * PAD-77: the backend emits KPI labels as English literals. Map the stable
 * slug (derived from that label) to an i18n key so the card title respects the
 * selected language. Unknown slugs fall back to the raw backend label.
 */
const KPI_LABEL_KEYS: Record<string, string> = {
  players: "dashboard.kpi.players",
  "upcoming-classes": "dashboard.kpi.upcomingClasses",
  "pending-validation": "dashboard.kpi.pendingValidation",
  "revenue-est": "dashboard.kpi.revenue",
  attended: "dashboard.kpi.attended",
  missed: "dashboard.kpi.missed",
  "upcoming-lessons": "dashboard.kpi.upcomingLessons",
  invites: "dashboard.kpi.invites",
};

export function KpiGridBlock({ block }: { block: DashboardKpiGridBlock }) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    // Desktop column count follows the ITEM count, so a row always fills its
    // width. Hardcoding lg:grid-cols-4 left a quarter of the row empty
    // whenever the backend sent 3 KPIs, and the tiles bunched to the left.
    // Below `sm` it stays at 2. It used to only engage at `lg`, which left an
    // empty cell for a 3-tile row across the ENTIRE range under 1024px.
    <div
      className="grid gap-4 grid-cols-2 sm:[grid-template-columns:repeat(var(--kpi-cols),minmax(0,1fr))]"
      style={{ "--kpi-cols": Math.min(block.data.items.length, 6) } as React.CSSProperties}
    >
      {block.data.items.map((item) => {
        const Icon = iconMap[item.icon];
        // PAD-76: the backend omits `href` for KPIs that have no page yet.
        // Those cards must stay inert rather than navigating to the 404 route.
        const href = item.href;
        // PAD-77: translate the label via its stable slug; fall back to the raw
        // backend label for any KPI we don't have a mapping for.
        const labelKey = KPI_LABEL_KEYS[kpiKey(item.label)];
        const label = labelKey ? t(labelKey) : item.label;

        return (
          <Card
            key={item.label}
            data-testid={`dashboard-kpi-${kpiKey(item.label)}`}
            data-clickable={href ? "true" : "false"}
            {...(href
              ? {
                  role: "button",
                  tabIndex: 0,
                  onClick: () => navigate(href),
                }
              : {})}
            className={
              // Cards take borders, not shadows — hover darkens instead of
              // lifting, so a grid of tiles stays flat and calm.
              href
                ? "cursor-pointer hover:bg-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                : ""
            }
          >
            <CardHeader className="flex flex-row items-start justify-between pb-1 p-4">
              {/* Eyebrow: it opens the tile and never competes with the number. */}
              <CardTitle className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {/* The number is the content, so it gets the display face. */}
              <div className="font-display text-[34px] leading-none font-bold tabular-nums">
                {item.prefix ?? ""}
                {item.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
