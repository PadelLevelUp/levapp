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

export function KpiGridBlock({ block }: { block: DashboardKpiGridBlock }) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {block.data.items.map((item) => {
        const Icon = iconMap[item.icon];

        return (
          <Card
            key={item.label}
            role="button"
            tabIndex={0}
            onClick={() => navigate(item.href)}
            className="cursor-pointer hover:shadow-md transition-shadow"
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
