/**
 * A class in the calendar grid. Encodes status, fill and level on one block
 * without turning the week into a rainbow.
 *
 * @startingPoint section="App" subtitle="Calendar block: scheduled, needs filling, now, done, event" viewport="700x180"
 */
export interface ClassBlockProps {
  title: string;
  /** e.g. "10:30 – 12:00". */
  time: string;
  /** e.g. "Campo 2". */
  court?: string;
  /** Short level chip, e.g. "N4-". */
  level?: string;
  filled?: number;
  capacity?: number;
  /**
   * scheduled = upcoming and healthy (solid blue).
   * needsFilling = seats unsold (dashed amber outline).
   * now = happening right now (white, blue outline, glow).
   * done = past (muted grey with a green tick).
   * event = not a class (violet, left bar).
   * @default "scheduled"
   */
  status?: "scheduled" | "needsFilling" | "now" | "done" | "event";
  onClick?: () => void;
  style?: React.CSSProperties;
}

export declare function ClassBlock(props: ClassBlockProps): JSX.Element;
