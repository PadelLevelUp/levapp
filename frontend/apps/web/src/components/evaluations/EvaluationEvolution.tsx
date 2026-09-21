import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { EvaluationCompetency } from "@levelup/types";
import {
  EVOLUTION_LINE_COLOR,
  competencyLabel,
  defaultEvolutionCompetency,
  deltaPresentation,
  evolutionMonthLabels,
  formatMean,
} from "@levelup/config";
import { useHeldWhile, usePlayerEvolution } from "@levelup/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface EvaluationEvolutionProps {
  playerId: string;
  /** The coach's competency set — for the pills' labels. */
  competencies: EvaluationCompetency[];
  /** From the history read: every competency this player has a rating for, switched-off ones included. */
  competenciesWithData: number[];
  /**
   * True while the evaluation form below is open. The section then keeps the shape it
   * had — same pills, same figures — so a rating saved on tap never moves the form
   * under the coach's finger; it follows the server again the moment the form closes.
   */
  held?: boolean;
}

/**
 * "Evolução" (evaluations.evolution, PAD-375). The server computes every figure —
 * monthly means, the three rolling means, the delta (R-048) — and this only draws
 * them: a single 2px line of monthly means on the competency's OWN scale, three
 * figures, and a plain-words delta. One series, so no legend: the selected pill
 * names it. Text wears text tokens, never the line's colour. Every value is
 * reachable without hover — a table of the series is always there for touch and
 * for screen readers; the tooltip is a convenience on top.
 */
export function EvaluationEvolution({ playerId, competencies, competenciesWithData: latestWithData, held = false }: EvaluationEvolutionProps) {
  const competenciesWithData = useHeldWhile(latestWithData, held, playerId);
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState<number | null>(() => defaultEvolutionCompetency(competenciesWithData));
  // The first competency WITH DATA, and never another player's selection.
  useEffect(() => {
    setSelected((now) => defaultEvolutionCompetency(competenciesWithData, now));
  }, [playerId, competenciesWithData]);

  const evolution = usePlayerEvolution(playerId, selected);
  // Before the early return below: a hook may never come after one.
  const data = useHeldWhile(evolution.data, held, `${playerId}:${selected}`);

  if (competenciesWithData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="evaluation-evolution-empty">
        {t("players.evaluationHistory.evolutionEmpty")}
      </p>
    );
  }

  const labelOf = (id: number) => {
    const competency = competencies.find((c) => c.id === id);
    return competency ? competencyLabel(t, competency) : `#${id}`;
  };
  const months = data ? evolutionMonthLabels(data.series, i18n.language) : [];
  const points = data ? data.series.map((point, index) => ({ month: months[index], mean: point.mean })) : [];
  const delta = data ? deltaPresentation(data.delta) : null;
  const sinceLabel = delta && data
    ? evolutionMonthLabels([{ month: delta.sinceMonth, mean: 0 }, ...data.series], i18n.language)[0]
    : "";
  const ticks = data ? Array.from({ length: data.scaleMax - data.scaleMin + 1 }, (_, i) => data.scaleMin + i) : [];

  return (
    // The line's colour is a selected step per mode (validated with the dataviz script), not a flip.
    <div
      className="space-y-4"
      style={{ ["--evolution-line-light" as string]: EVOLUTION_LINE_COLOR.light, ["--evolution-line-dark" as string]: EVOLUTION_LINE_COLOR.dark }}
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("players.evaluationHistory.evolutionPills")}>
        {competenciesWithData.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelected(id)}
            aria-pressed={selected === id}
            data-testid={`evolution-pill-${id}`}
            className={cn(
              "min-h-9 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-accent"
            )}
          >
            {labelOf(id)}
          </button>
        ))}
      </div>

      {evolution.isLoading && <Skeleton className="h-44 w-full" />}
      {evolution.isError && !(held && data) && (
        <p className="text-sm text-destructive" role="alert">{t("players.evaluationHistory.evolutionLoadFailed")}</p>
      )}

      {data && selected !== null && (
        <>
          <figure
            className="h-44 w-full text-[var(--evolution-line-light)] dark:text-[var(--evolution-line-dark)]"
            role="img"
            aria-label={t("players.evaluationHistory.chartLabel", { name: labelOf(selected), min: data.scaleMin, max: data.scaleMax })}
            data-testid="evolution-chart"
            data-scale={`${data.scaleMin}-${data.scaleMax}`}
            data-points={points.length}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 12, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeWidth={1} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis domain={[data.scaleMin, data.scaleMax]} ticks={ticks} allowDecimals={false} tickLine={false} axisLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--border))" }}
                  formatter={(value: number) => [formatMean(value), labelOf(selected)]}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))" }}
                />
                {/* 2px line, >= 8px markers with a surface ring; a single point is one dot and no line. */}
                <Line type="linear" dataKey="mean" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  dot={{ r: 4, fill: "currentColor", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: "currentColor", stroke: "hsl(var(--card))", strokeWidth: 2 }}
                  isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </figure>

          <table className="sr-only" data-testid="evolution-table">
            <thead>
              <tr><th>{t("players.evaluationHistory.tableMonth")}</th><th>{t("players.evaluationHistory.tableMean")}</th></tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.month}><td>{point.month}</td><td>{formatMean(point.mean)}</td></tr>
              ))}
            </tbody>
          </table>

          <dl className="grid grid-cols-3 gap-2">
            {([["m1", "meanMonthly"], ["m6", "meanSemester"], ["m12", "meanYear"]] as const).map(([key, label]) => (
              <div key={key} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{t(`players.evaluationHistory.${label}`)}</dt>
                <dd className="text-xl font-semibold tabular-nums" data-testid={`evolution-mean-${key}`} data-value={formatMean(data.means[key])}>
                  {formatMean(data.means[key])}
                </dd>
              </div>
            ))}
          </dl>

          {delta && (
            <p
              // Green is for up only, and never alone: an icon and the words carry it too.
              className={cn("flex items-center gap-1.5 text-sm font-medium", delta.trend === "up" ? "text-success" : "text-muted-foreground")}
              data-testid="evolution-delta"
              data-trend={delta.trend}
            >
              {delta.trend === "up" ? <TrendingUp className="h-4 w-4" aria-hidden /> : delta.trend === "down" ? <TrendingDown className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
              {t(
                delta.trend === "up" ? "players.evaluationHistory.deltaUp" : delta.trend === "down" ? "players.evaluationHistory.deltaDown" : "players.evaluationHistory.deltaFlat",
                { value: delta.text, month: sinceLabel }
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}
