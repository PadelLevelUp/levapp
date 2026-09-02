import * as React from "react";

/**
 * Initials-first avatar. Photos are optional and most players have none.
 *
 * @startingPoint section="Core" subtitle="Initials avatars and overlapping stacks" viewport="700x130"
 */
export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Full name; initials are derived from the first two words. */
  name?: string;
  /** @default "md" */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** @default "neutral" */
  tone?: "neutral" | "accent" | "solid" | "inverse";
  src?: string;
}

export interface AvatarStackProps {
  /** Names, or objects with name + tone. */
  people?: Array<string | { name: string; tone?: AvatarProps["tone"] }>;
  /** @default 3 */
  max?: number;
  /** @default "sm" */
  size?: AvatarProps["size"];
  /** Overrides the "+N" chip, e.g. "+9". */
  overflowLabel?: string;
  /** Ring colour — must match the surface behind the stack. @default "var(--surface-card)" */
  ringColor?: string;
}

export declare function Avatar(props: AvatarProps): JSX.Element;
export declare function AvatarStack(props: AvatarStackProps): JSX.Element;
