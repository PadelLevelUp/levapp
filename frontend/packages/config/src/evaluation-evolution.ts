import { format, parseISO } from "date-fns";
import type { EvaluationEvolution } from "@levelup/types";
import { resolveDateLocale } from "./dateLocale";

// "Evolução" (PAD-375, evaluations.evolution). EVERY FIGURE IS THE SERVER'S (R-048):
// monthly means, the three rolling means and the delta arrive computed and rounded.
// What lives here only PRESENTS a known response — labels, a sign, pixel positions —
// so web and iOS can never disagree on a number.

/** The line's colour: a SELECTED step per mode, not one colour flipped. `#1355DC` is
 *  the brand primary; on the dark surface (#0F1B2E) the dark primary `#4A9BFF` falls
 *  outside the lightness band of the dataviz validator, `#3B82F6` passes. */
export const EVOLUTION_LINE_COLOR = { light: "#1355DC", dark: "#3B82F6" } as const;

/** The competency the section opens on: the current selection while it still has data,
 *  else the FIRST one with data — never a hard-coded key (the canvas's mock defect). */
export function defaultEvolutionCompetency(competenciesWithData: number[], selected?: number | null): number | null {
  if (selected != null && competenciesWithData.includes(selected)) return selected;
  return competenciesWithData.length > 0 ? competenciesWithData[0] : null;
}

/** Short month labels in the active locale; the year joins once the series spans more than one. */
export function evolutionMonthLabels(series: EvaluationEvolution["series"], language: string): string[] {
  const spansYears = new Set(series.map((point) => point.month.slice(0, 4))).size > 1;
  const locale = resolveDateLocale(language);
  return series.map((point) =>
    format(parseISO(`${point.month}-01`), spansYears ? "MMM yy" : "MMM", { locale }).replace(".", "")
  );
}

export type DeltaTrend = "up" | "down" | "flat";

/** Green is for up only; down and zero are neutral, and zero prints "=" — never "↑ +0" (Q13). */
export function deltaPresentation(
  delta: EvaluationEvolution["delta"]
): { trend: DeltaTrend; text: string; sinceMonth: string } | null {
  if (delta === null) return null;
  const trend: DeltaTrend = delta.value > 0 ? "up" : delta.value < 0 ? "down" : "flat";
  const text = trend === "flat" ? "=" : `${delta.value > 0 ? "+" : ""}${delta.value.toFixed(1)}`;
  return { trend, text, sinceMonth: delta.sinceMonth };
}

/** One decimal, as sent; a dash when the window holds no rating. */
export function formatMean(mean: number | null): string {
  return mean === null ? "—" : mean.toFixed(1);
}

export interface ChartBox {
  scaleMin: number;
  scaleMax: number;
  width: number;
  height: number;
  paddingX: number;
  paddingTop: number;
  paddingBottom: number;
}

/** Pixel positions for a hand-drawn polyline (iOS). The y axis is the competency's OWN
 *  scale, end to end; a single point sits in the middle — one dot, no line. */
export function chartPoints(series: EvaluationEvolution["series"], box: ChartBox): { x: number; y: number }[] {
  const plotWidth = box.width - 2 * box.paddingX;
  const plotHeight = box.height - box.paddingTop - box.paddingBottom;
  const span = box.scaleMax - box.scaleMin || 1;
  return series.map((point, index) => ({
    x: series.length === 1 ? box.width / 2 : box.paddingX + (plotWidth * index) / (series.length - 1),
    y: box.paddingTop + plotHeight * (1 - (point.mean - box.scaleMin) / span),
  }));
}
