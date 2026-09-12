/**
 * Two metrics, each with a denominator — and never a third.
 *
 * This block sits last because it informs rather than prompts: "52 players"
 * says nothing about whether the academy is healthy, but "38 of 52 active, 14
 * idle" does, and it points at work. The trend and delta are desktop-only; at
 * mobile width seven bars are a few pixels each and read as decoration.
 */
import type { DashboardWeekPulseBlock } from "@levelup/types";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Eyebrow, Sparkbars, StatCard } from "./primitives";

export function WeekPulse({ block }: { block: DashboardWeekPulseBlock }) {
  const { t } = useTranslation();
  const { seatsFilled, players } = block.data;

  return (
    <section className="flex flex-col gap-2.5" data-testid="dashboard-week-pulse">
      <Eyebrow className="px-1">{t("dashboard.pulse.eyebrow")}</Eyebrow>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          testId="dashboard-pulse-seats-filled"
          ariaLabel={`${t("dashboard.pulse.seatsFilled")}: ${seatsFilled.pct}%`}
          label={t("dashboard.pulse.seatsFilled")}
          value={
            <>
              {seatsFilled.pct}
              <span className="text-base text-muted-foreground">%</span>
            </>
          }
          sub={t("dashboard.pulse.seatsFilledSub", {
            filled: seatsFilled.filled,
            total: seatsFilled.total,
          })}
        >
          <div className="hidden lg:block">
            <Sparkbars values={seatsFilled.trend} />
            {/* Omitted rather than "+0%" when there is no prior week. */}
            {seatsFilled.deltaPct !== null && (
              <span
                className={cn(
                  "text-[11px] font-semibold tabular-nums",
                  seatsFilled.deltaPct >= 0 ? "text-success-strong" : "text-warning-strong",
                )}
              >
                {seatsFilled.deltaPct >= 0 ? "+" : ""}
                {seatsFilled.deltaPct}%
              </span>
            )}
          </div>
        </StatCard>

        <StatCard
          testId="dashboard-pulse-active-players"
          ariaLabel={`${t("dashboard.pulse.activePlayers")}: ${players.active}`}
          label={t("dashboard.pulse.activePlayers")}
          value={players.active}
          sub={t("dashboard.pulse.activePlayersSub", {
            total: players.total,
            idle: players.idle,
          })}
        />
      </div>
    </section>
  );
}
