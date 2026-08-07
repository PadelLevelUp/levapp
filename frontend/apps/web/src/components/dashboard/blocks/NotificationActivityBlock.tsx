import { formatDistanceToNow } from "date-fns";
import { Bell, Send } from "lucide-react";

import { useTranslation } from "react-i18next";

import type { DashboardNotificationActivityBlock } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  sent: "bg-primary/10 text-primary",
  confirmed: "bg-success/15 text-success",
  expired: "bg-muted text-muted-foreground",
  queued: "bg-warning/15 text-warning",
};

export function NotificationActivityBlock({
  block,
}: {
  block: DashboardNotificationActivityBlock;
}) {
  const { items } = block.data;
  const { t } = useTranslation();
  // PAD-77: the backend emits the block title ("Notification activity") as an
  // English literal. The block id is stable, so translate off that; fall back
  // to the raw backend title for any other notification-activity block.
  const title =
    block.id === "notification_activity"
      ? t("dashboard.activity.title")
      : block.data.title;

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
                    {t(`dashboard.status.${item.status}`, { defaultValue: item.status })}
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
