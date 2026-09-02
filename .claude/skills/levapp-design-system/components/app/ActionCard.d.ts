import * as React from "react";

/**
 * One item in the action queue: a thing that needs a decision, with the decision attached.
 *
 * @startingPoint section="App" subtitle="Queue item with its decision inline" viewport="700x200"
 */
export interface ActionCardProps {
  title: React.ReactNode;
  /** The facts behind the decision, e.g. "quinta 6 ago · 10:30 · Nível 4- · 7/16". */
  detail?: React.ReactNode;
  /** Left bar. attention when seats are unfilled, accent when a player replied. */
  accent?: "attention" | "accent" | "problem" | "progress";
  /** Renders an avatar when the item is about one player. */
  person?: string;
  primaryLabel?: React.ReactNode;
  onPrimary?: () => void;
  secondaryLabel?: React.ReactNode;
  onSecondary?: () => void;
  style?: React.CSSProperties;
}

export declare function ActionCard(props: ActionCardProps): JSX.Element;
