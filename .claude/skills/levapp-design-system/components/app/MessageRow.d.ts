/**
 * A thread in the inbox, carrying its state so eight identical chases collapse
 * into eight readable lines.
 *
 * @startingPoint section="App" subtitle="Inbox thread: unread, waiting, resolved, declined" viewport="700x260"
 */
export interface MessageRowProps {
  name: string;
  /** One line: the player's words if they replied, otherwise what was sent. */
  preview: React.ReactNode;
  /** "17:05", "ter", "seg". */
  time?: string;
  /**
   * unread = the player replied and you owe an answer.
   * waiting = sent, no reply yet. resolved = settled. declined = closed, dimmed.
   * @default "waiting"
   */
  state?: "unread" | "waiting" | "resolved" | "declined";
  /** Inline chips: quick actions or the chase count. */
  actions?: Array<{ label: string; tone?: "neutral" | "accent" | "done" | "attention" | "problem" | "progress" }>;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export declare function MessageRow(props: MessageRowProps): JSX.Element;
