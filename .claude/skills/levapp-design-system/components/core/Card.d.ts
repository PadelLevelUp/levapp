import * as React from "react";

/**
 * The container for one object or one decision.
 *
 * @startingPoint section="Core" subtitle="Default, sunken, inverse, accent-barred" viewport="700x220"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** inverse is the navy gradient used for the "next class" hero. @default "default" */
  tone?: "default" | "sunken" | "inverse";
  /** Adds a 4px left bar. Reserved for items in an action queue. */
  accent?: "attention" | "accent" | "problem" | "progress";
  /** @default "var(--space-5)" */
  padding?: string;
  /** Only for things that genuinely float: sheets, popovers, the phone frame. */
  floating?: boolean;
  children?: React.ReactNode;
}

export declare function Card(props: CardProps): JSX.Element;
