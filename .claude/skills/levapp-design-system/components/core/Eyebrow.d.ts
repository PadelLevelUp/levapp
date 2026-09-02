import * as React from "react";

/**
 * The uppercase marker that opens a group of rows. Replaces heavy section headings.
 *
 * @startingPoint section="Core" subtitle="Group label with optional inline action" viewport="700x100"
 */
export interface EyebrowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional text action on the right, e.g. "Selecionar todos". */
  action?: React.ReactNode;
  onAction?: () => void;
  children?: React.ReactNode;
}

export declare function Eyebrow(props: EyebrowProps): JSX.Element;
