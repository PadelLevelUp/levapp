/**
 * A communication rule shown as an object with its results attached.
 *
 * @startingPoint section="App" subtitle="Automation rule with template and outcome counts" viewport="700x260"
 */
export interface AutomationRowProps {
  title: React.ReactNode;
  /** When it fires and to whom, in plain language. */
  rule?: React.ReactNode;
  enabled?: boolean;
  onToggle?: (next: boolean) => void;
  /** Outcome counts: sent / accepted / no reply. */
  stats?: Array<{ value: React.ReactNode; label: React.ReactNode; tone?: "default" | "done" | "attention" }>;
  /** The message body, with {nome} style placeholders shown literally. */
  template?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function AutomationRow(props: AutomationRowProps): JSX.Element;
