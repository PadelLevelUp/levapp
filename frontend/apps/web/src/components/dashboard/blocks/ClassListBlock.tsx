import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardClassListBlock, DashboardIcon } from "@/types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";

const listIconMap: Partial<Record<DashboardIcon, React.ComponentType<{ className?: string }>>> = {
  user_plus: UserPlus,
};

/**
 * PAD-77: the backend emits class-list titles / empty texts as English
 * literals. Map the stable block id to an i18n key so they respect the selected
 * language, falling back to the raw backend string for unknown blocks.
 */
const LIST_TITLE_KEYS: Record<string, string> = {
  upcoming_classes: "dashboard.list.upcomingClasses",
  needs_players: "dashboard.list.needsPlayers",
  player_upcoming: "dashboard.list.yourUpcomingLessons",
  player_invites: "dashboard.list.invitesToConfirm",
};

const LIST_EMPTY_KEYS: Record<string, string> = {
  needs_players: "dashboard.list.allClassesFull",
  player_invites: "dashboard.list.noPendingInvites",
};

export function ClassListBlock({ block }: { block: DashboardClassListBlock }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const Icon = block.data.icon ? listIconMap[block.data.icon] : undefined;

  const titleKey = LIST_TITLE_KEYS[block.id];
  const title = titleKey ? t(titleKey) : block.data.title;

  const emptyKey = LIST_EMPTY_KEYS[block.id];
  const emptyText = emptyKey ? t(emptyKey) : block.data.emptyText;

  /**
   * The "needs players" badge is emitted as "Missing <n>". Translate it via the
   * count so it localizes; anything that doesn't match is rendered verbatim.
   */
  const badgeLabel = (badge?: string): string | undefined => {
    if (!badge) return undefined;
    const m = /^Missing (\d+)$/.exec(badge);
    return m ? t("dashboard.list.missingSeats", { count: Number(m[1]) }) : badge;
  };

  return (
    <Card>
      <CardHeader className={Icon ? "flex flex-row items-center justify-between" : ""}>
        <CardTitle>{title}</CardTitle>
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
                      {badgeLabel(item.badge)}
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

          {block.data.items.length === 0 && emptyText ? (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
