import { formatDistanceToNow } from "date-fns";
import { Bell, Send } from "lucide-react";

import { useTranslation } from "react-i18next";

import type { DashboardNotificationActivityBlock } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-blue-100 text-blue-700",
  confirmed: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-500",
  queued: "bg-yellow-100 text-yellow-700",
};

export function NotificationActivityBlock({
  block,
}: {
  block: DashboardNotificationActivityBlock;
}) {
  const { title, items } = block.data;
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.noNotificationActivity")}</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/50"
              >
                <div className="mt-0.5 shrink-0">
                  {item.type === "manual" ? (
                    <Send className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.player.name ?? t("dashboard.unknownStudent")}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.lessonInstance.title ?? t("dashboard.classFallback")}{" "}
                    {item.type === "auto" &&
                      `· ${t("dashboard.round", { number: item.roundNumber })}`}
                  </p>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full font-medium",
                      STATUS_STYLES[item.status] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.status}
                  </span>
                  {item.createdAt && (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
