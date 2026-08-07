import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardClassListBlock, DashboardIcon } from "@/types";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { UserPlus } from "lucide-react";
import { OccupancyBar, parseOccupancy } from "@/components/ui/occupancy-bar";

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
          {block.data.items.map((item) => {
            // "2/6" is what the backend already sends as rightLabel — the bar
            // needs no new endpoint.
            const occupancy = parseOccupancy(item.rightLabel);
            return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.href)}
              className="w-full text-left flex items-stretch gap-3 p-3 rounded-xl border bg-card cursor-pointer hover:bg-accent/40 transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              {/* The class's own colour, as identity — a 4px spine, not a fill. */}
              <div
                className="w-1 rounded-full shrink-0 self-stretch"
                style={{ backgroundColor: item.color ?? "hsl(var(--border))" }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold truncate">{item.title}</p>
                  {item.badge ? (
                    // "Missing 4" is the coach's problem to solve — amber's one
                    // job — not neutral information.
                    <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-md bg-warning/15 text-warning tabular-nums">
                      {badgeLabel(item.badge)}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {item.dateLabel} · {item.timeLabel}
                </p>
                {occupancy ? (
                  <div className="mt-2 flex items-center gap-2">
                    <OccupancyBar
                      filled={occupancy.filled}
                      total={occupancy.total}
                      className="flex-1"
                      label={t("dashboard.list.seatsFilled", {
                        filled: occupancy.filled,
                        total: occupancy.total,
                        defaultValue: `${occupancy.filled} of ${occupancy.total} confirmed`,
                      })}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {item.rightLabel}
                    </span>
                  </div>
                ) : item.rightLabel ? (
                  <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                    {item.rightLabel}
                  </p>
                ) : null}
              </div>
            </button>
            );
          })}

          {block.data.items.length === 0 && emptyText ? (
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
