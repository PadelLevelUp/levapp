/**
 * On/off for a setting or an automation rule. Applies immediately — there is no Save button.
 *
 * @startingPoint section="Core" subtitle="Switch, on/off/disabled" viewport="700x110"
 */
export interface ToggleProps {
  checked?: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Optional text to the right of the switch. */
  label?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Toggle(props: ToggleProps): JSX.Element;
