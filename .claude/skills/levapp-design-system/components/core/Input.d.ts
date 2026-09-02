import * as React from "react";

/**
 * Text field. Also the message composer when `multiline`.
 *
 * @startingPoint section="Core" subtitle="Text field, search, composer, error" viewport="700x200"
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  /** Helper text below the field. */
  hint?: React.ReactNode;
  /** Replaces hint and turns the border red. */
  error?: React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  /** Renders a textarea — used for message templates. */
  multiline?: boolean;
}

export declare function Input(props: InputProps): JSX.Element;
