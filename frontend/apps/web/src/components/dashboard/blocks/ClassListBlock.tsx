import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardClassListBlock, DashboardIcon } from "@/types";
import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";

const listIconMap: Partial<Record<DashboardIcon, React.ComponentType<{ className?: string }>>> = {
  user_plus: UserPlus,
};

export function ClassListBlock({ block }: { block: DashboardClassListBlock }) {
  const navigate = useNavigate();
  const Icon = block.data.icon ? listIconMap[block.data.icon] : undefined;

  return (
    <Card>
      <CardHeader className={Icon ? "flex flex-row items-center justify-between" : ""}>
        <CardTitle>{block.data.title}</CardTitle>
        {Icon ? <Icon className="w-4 h-4 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {block.data.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.href)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <div
                className="w-1 h-10 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{item.title}</p>
                  {item.badge ? (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.dateLabel} · {item.timeLabel}
                </p>
              </div>
              {item.rightLabel ? (
                <div className="text-sm text-muted-foreground">{item.rightLabel}</div>
              ) : null}
            </button>
          ))}

          {block.data.items.length === 0 && block.data.emptyText ? (
            <p className="text-sm text-muted-foreground">{block.data.emptyText}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
