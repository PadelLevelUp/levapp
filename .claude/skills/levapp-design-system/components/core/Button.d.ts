import * as React from "react";

/**
 * The single button primitive. Exactly one `primary` button per view.
 *
 * @startingPoint section="Core" subtitle="Primary, secondary, ghost, quiet, danger" viewport="700x150"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = the one action of the view. danger is never filled. @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "quiet" | "danger";
  /** md is 44px — the minimum touch target. Use sm only on desktop-dense rows. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Stretch to the container. Used for the bottom action of a mobile sheet. */
  fullWidth?: boolean;
  disabled?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}

export declare function Button(props: ButtonProps): JSX.Element;
