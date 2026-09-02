import * as React from "react";

/**
 * One metric with its trend. Never more than three on a screen.
 *
 * @startingPoint section="App" subtitle="Metric with delta and sparkline bars" viewport="700x260"
 */
export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Denominator or context, e.g. "211 de 240 lugares". */
  sub?: React.ReactNode;
  /** Signed change, e.g. "+6%". */
  delta?: React.ReactNode;
  /** @default "done" */
  deltaTone?: "done" | "attention" | "problem";
  /** Bar heights as percentages, oldest first. The last bar is the current period. */
  bars?: number[];
  /** attention colours the number amber. @default "default" */
  tone?: "default" | "attention";
  style?: React.CSSProperties;
}

export declare function StatCard(props: StatCardProps): JSX.Element;
