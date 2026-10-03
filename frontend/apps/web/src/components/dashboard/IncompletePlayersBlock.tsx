/**
 * dashboard.profile-completeness rule 3 (PAD-486): the coach's students whose link has no level
 * or no side, with what each one costs (rule 2). A name opens that player, where both are set;
 * "See all" opens the Players list on the matching filter.
 */
import type { DashboardIncompletePlayersBlock } from "@levelup/types";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ActionCard } from "./coach/primitives";

export function IncompletePlayersBlock({ block }: { block: DashboardIncompletePlayersBlock }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { count, players, seeAllHref } = block.data;

  return (
    <ActionCard accent="attention" testId="dashboard-incomplete-players">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-base font-semibold">
              {t("dashboard.profileCompleteness.coachTitle")}{" "}
              <span className="tabular-nums text-muted-foreground" data-testid="dashboard-incomplete-players-count">
                ({count})
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">{t("dashboard.profileCompleteness.coachBody")}</p>
          </div>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {players.map((p) => (
            <li key={p.playerId}>
              <button
                type="button"
                data-testid={`dashboard-incomplete-player-${p.playerId}`}
                onClick={() => navigate(p.href)}
                className="flex w-full min-h-11 items-center justify-between gap-3 py-2 text-left hover:bg-accent/40 rounded-lg px-1"
              >
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="flex shrink-0 gap-1.5">
                  {p.missing.map((m) => (
                    <span
                      key={m}
                      className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning"
                    >
                      {t(m === "level" ? "dashboard.profileCompleteness.noLevel" : "dashboard.profileCompleteness.noSide")}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {count > players.length && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            data-testid="dashboard-incomplete-players-see-all"
            onClick={() => navigate(seeAllHref)}
          >
            {t("dashboard.profileCompleteness.seeAll")}
          </Button>
        )}
      </div>
    </ActionCard>
  );
}
