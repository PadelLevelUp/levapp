import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardKpiGridBlock, DashboardIcon } from "@/types";
import { useNavigate } from "react-router-dom";
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

export function KpiGridBlock({ block }: { block: DashboardKpiGridBlock }) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {block.data.items.map((item) => {
        const Icon = iconMap[item.icon];
        // PAD-76: the backend omits `href` for KPIs that have no page yet.
        // Those cards must stay inert rather than navigating to the 404 route.
        const href = item.href;

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
              href
                ? "cursor-pointer hover:shadow-md transition-shadow"
                : "transition-shadow"
            }
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.label}
              </CardTitle>
              <Icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
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
