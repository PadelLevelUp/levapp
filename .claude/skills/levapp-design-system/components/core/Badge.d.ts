import * as React from "react";

/**
 * A pill carrying one piece of state. Each tone has exactly one meaning.
 *
 * @startingPoint section="Core" subtitle="Status pills: done, attention, problem, progress" viewport="700x130"
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * done = finished/confirmed (green). attention = needs the coach (amber).
   * problem = failure/declined (red). progress = player-side, level, evaluation (violet).
   * accent = informational, brand blue. @default "neutral"
   */
  tone?: "neutral" | "accent" | "done" | "attention" | "problem" | "progress";
  /** sm sits inside dense rows and calendar blocks. @default "md" */
  size?: "sm" | "md";
  children?: React.ReactNode;
}

export declare function Badge(props: BadgeProps): JSX.Element;
