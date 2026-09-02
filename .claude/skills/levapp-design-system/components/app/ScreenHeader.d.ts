import * as React from "react";

/**
 * The top of every screen: one title, at most one line of context, the account avatar.
 *
 * @startingPoint section="App" subtitle="Screen title bar with meta and avatar" viewport="700x140"
 */
export interface ScreenHeaderProps {
  title: React.ReactNode;
  /** Small line below the title, e.g. "4 itens · terça, 4 agosto". */
  meta?: React.ReactNode;
  /** Small line above the title, e.g. the date on the dashboard. */
  eyebrow?: React.ReactNode;
  /** Name of the signed-in coach; renders as an initials avatar. */
  user?: string;
  actions?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function ScreenHeader(props: ScreenHeaderProps): JSX.Element;
