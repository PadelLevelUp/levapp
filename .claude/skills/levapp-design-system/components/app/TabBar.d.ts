import * as React from "react";

/**
 * Mobile bottom navigation. The active state is a filled shape behind the icon,
 * not just a colour change.
 *
 * @startingPoint section="App" subtitle="Bottom tab bar with badge" viewport="700x120"
 */
export interface TabBarItem {
  value: string;
  label: string;
  /** 12–16px glyph. Falls back to a square placeholder. */
  icon?: React.ReactNode;
  /** Red count dot, e.g. unread messages. */
  badge?: number;
}

export interface TabBarProps {
  items?: TabBarItem[];
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

export declare function TabBar(props: TabBarProps): JSX.Element;
