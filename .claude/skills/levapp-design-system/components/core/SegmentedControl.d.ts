/**
 * Two to four peer views of the same data. Not navigation.
 *
 * @startingPoint section="Core" subtitle="Tab switcher with optional counts" viewport="700x110"
 */
export interface SegmentedOption {
  value: string;
  label: string;
  /** Rendered after the label as "· 1". */
  count?: number;
}

export interface SegmentedControlProps {
  options?: Array<string | SegmentedOption>;
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}

export declare function SegmentedControl(props: SegmentedControlProps): JSX.Element;
