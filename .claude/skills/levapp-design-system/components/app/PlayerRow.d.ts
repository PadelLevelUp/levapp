import * as React from "react";

/**
 * A player in a list. Shows what you pick people by — level, hand, attendance,
 * whether they have an account. Never email.
 *
 * @startingPoint section="App" subtitle="Player list row, plain and selectable" viewport="700x220"
 */
export interface PlayerRowProps {
  name: string;
  /** Level string without the word, e.g. "3-". */
  level?: string;
  /** "Esquerda" | "Direita". */
  hand?: string;
  /** Extra state pills, e.g. [{ label: "Sem conta" }]. */
  flags?: Array<{ label: string; tone?: "neutral" | "accent" | "done" | "attention" | "problem" | "progress" }>;
  /** Last 8 classes, newest last. true = attended. */
  attendance?: boolean[];
  /** Turns the row into a checkbox row for bulk invites. */
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  /** Replaces the badge row with one line of context, e.g. "Nível 4- · em espera". */
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function PlayerRow(props: PlayerRowProps): JSX.Element;
