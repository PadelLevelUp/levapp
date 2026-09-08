/**
 * Card variants for the phone calendar — calendar.mobile-views rules 5 and 7.
 *
 * `resolveEventState` already answers "what is this event doing"; this module
 * turns that into the card's treatment, shared by web (CSS custom properties)
 * and iOS (resolved colours) so the two shells cannot disagree about what a
 * next, finished or canceled class looks like.
 *
 *   scheduled  solid coach colour
 *   next       card surface, 1.5px outline in the coach colour
 *   past       coach colour faded, muted text
 *   canceled   the destructive surface — red means canceled and nothing else
 *   block      class-driven (dashed card), nothing inline
 *
 * Amber never touches the surface: `seatsShort` is what the fill bar and the
 * X/Y count read, and it is only ever true for a scheduled or next class.
 */
import type { CalendarEvent } from "@levelup/types";
import {
  contrastTextOn,
  contrastTextOnNative,
  fadeColor,
  fadeColorNative,
  hasOpenSpots,
  readableInk,
  readableInkNative,
  resolveEventState,
  type CalendarSurfaces,
  type EventVisualState,
} from "./calendar-status";
import { lightTheme } from "./tokens";

export type CardVariant = "scheduled" | "next" | "past" | "canceled" | "block";

const VARIANT_BY_STATE: Record<EventVisualState, CardVariant> = {
  future: "scheduled",
  next: "next",
  past: "past",
  canceled: "canceled",
  block: "block",
};

export interface ResolvedCard {
  variant: CardVariant;
  /** Empty seats on a class the coach can still fill. Drives the amber bar. */
  seatsShort: boolean;
}

export function resolveCardVariant(
  event: CalendarEvent,
  options: { isNext?: boolean; now?: Date } = {}
): ResolvedCard {
  const variant = VARIANT_BY_STATE[resolveEventState(event, options)];
  const seatsShort =
    (variant === "scheduled" || variant === "next") && hasOpenSpots(event);
  return { variant, seatsShort };
}

/** Inline style for a web card. Token references resolve per theme. */
export interface WebCardSurface {
  backgroundColor?: string;
  color?: string;
  border?: string;
}

export function cardSurfaceWeb(
  hex: string | undefined,
  variant: CardVariant
): WebCardSurface {
  switch (variant) {
    case "canceled":
      return {
        backgroundColor: "hsl(var(--destructive))",
        color: "hsl(var(--destructive-foreground))",
      };
    case "block":
      return {};
    case "next":
      if (!hex) {
        return {
          backgroundColor: "hsl(var(--card))",
          border: "1.5px solid hsl(var(--primary))",
          color: "hsl(var(--primary))",
        };
      }
      return {
        backgroundColor: "hsl(var(--card))",
        border: `1.5px solid ${hex}`,
        color: readableInk(hex),
      };
    case "past":
      if (!hex) {
        return {
          backgroundColor: "hsl(var(--muted))",
          color: "hsl(var(--muted-foreground))",
          border: "1px solid hsl(var(--border))",
        };
      }
      return {
        backgroundColor: fadeColor(hex),
        color: "hsl(var(--muted-foreground))",
        border: "1px solid hsl(var(--border))",
      };
    case "scheduled":
    default:
      if (!hex) {
        return {
          backgroundColor: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
        };
      }
      return { backgroundColor: hex, color: contrastTextOn(hex) };
  }
}

/** Resolved colours for a React Native card. */
export interface NativeCardSurface {
  backgroundColor?: string;
  color?: string;
  borderWidth?: number;
  borderColor?: string;
}

export function cardSurfaceNative(
  hex: string | undefined,
  variant: CardVariant,
  surfaces: CalendarSurfaces
): NativeCardSurface {
  switch (variant) {
    case "canceled":
      return {
        backgroundColor: lightTheme.destructive,
        color: lightTheme.destructiveForeground,
      };
    case "block":
      return {};
    case "next":
      if (!hex) {
        return {
          backgroundColor: surfaces.card,
          borderWidth: 1.5,
          borderColor: lightTheme.primary,
          color: lightTheme.primary,
        };
      }
      return {
        backgroundColor: surfaces.card,
        borderWidth: 1.5,
        borderColor: hex,
        color: readableInkNative(hex, surfaces),
      };
    case "past":
      return {
        backgroundColor: hex ? fadeColorNative(hex, surfaces) : lightTheme.muted,
        color: surfaces.mutedForeground,
        borderWidth: 1,
        borderColor: lightTheme.border,
      };
    case "scheduled":
    default:
      if (!hex) {
        return {
          backgroundColor: lightTheme.primary,
          color: lightTheme.primaryForeground,
        };
      }
      return { backgroundColor: hex, color: contrastTextOnNative(hex, surfaces) };
  }
}
