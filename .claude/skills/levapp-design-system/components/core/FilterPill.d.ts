import * as React from "react";

/**
 * A scrolling row of filters above a list. The active pill goes navy, not blue —
 * blue is reserved for actions.
 *
 * @startingPoint section="Core" subtitle="Filter row, active and resting" viewport="700x110"
 */
export interface FilterPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Appended after the label, e.g. "Por responder 1". */
  count?: number;
  children?: React.ReactNode;
}

export declare function FilterPill(props: FilterPillProps): JSX.Element;
