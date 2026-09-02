/**
 * How full a class is. The bar is texture; always show the count next to it.
 *
 * @startingPoint section="Core" subtitle="Fill bars for class occupancy" viewport="700x120"
 */
export interface ProgressBarProps {
  value?: number;
  /** @default 1 */
  max?: number;
  /** attention when seats are unfilled, done when full, onDark inside the navy hero. @default "accent" */
  tone?: "accent" | "done" | "attention" | "onDark";
  /** @default 6 */
  height?: number;
  style?: React.CSSProperties;
}

export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
