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
 *   open-spot  card surface, 1.5px DASHED outline in the coach colour, readable ink
 *              (B-541: an offer the student is not in — eligibility.open-spot-visibility
 *              rule 11; wins over scheduled/next, loses to canceled)
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

export type CardVariant =
  | "scheduled"
  | "next"
  | "past"
  | "canceled"
  | "block"
  | "open-spot"
  // PAD-611 (calendar.view rule 22): what an upcoming class is to the student viewing it.
  | "not-coming"
  | "invited"
  | "waiting";

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
  const state = resolveEventState(event, options);
  // B-541: an open spot is an offer, never the student's next class; a canceled, past or
  // block event keeps its own treatment.
  const upcoming = state === "future" || state === "next";
  const relation = event.studentRelation;
  // PAD-611: the student's own relation, for an upcoming class only — past and canceled keep
  // their treatment. An offer or an invitation is never the student's next class.
  const variant: CardVariant = !upcoming
    ? VARIANT_BY_STATE[state]
    : relation === "not_coming"
      ? "not-coming"
      : relation === "invited"
        ? "invited"
        : relation === "waiting"
          ? "waiting"
          : event.openSpot || relation === "open_spot"
            ? "open-spot"
            : VARIANT_BY_STATE[state];
  const seatsShort =
    (variant === "scheduled" || variant === "next" || variant === "open-spot" || variant === "invited") &&
    hasOpenSpots(event);
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
    case "waiting":
      return {
        backgroundColor: "hsl(var(--card))",
        border: "1.5px dotted hsl(var(--muted-foreground))",
        color: "hsl(var(--muted-foreground))",
      };
    case "not-coming":
      return cardSurfaceWeb(hex, "past");
    case "invited":
    case "open-spot":
      return {
        backgroundColor: "hsl(var(--card))",
        border: `1.5px dashed ${hex ?? "hsl(var(--primary))"}`,
        color: hex ? readableInk(hex) : "hsl(var(--primary))",
      };
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
  borderStyle?: "dashed" | "dotted";
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
    case "waiting":
      return {
        backgroundColor: surfaces.card,
        borderWidth: 1.5,
        borderStyle: "dotted",
        borderColor: surfaces.mutedForeground,
        color: surfaces.mutedForeground,
      };
    case "not-coming":
      return cardSurfaceNative(hex, "past", surfaces);
    case "invited":
    case "open-spot":
      return {
        backgroundColor: surfaces.card,
        borderWidth: 1.5,
        borderStyle: "dashed",
        borderColor: hex ?? lightTheme.primary,
        color: hex ? readableInkNative(hex, surfaces) : lightTheme.primary,
      };
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

/** Who is looking at the calendar — PAD-578. */
export type CalendarViewer = "coach" | "student";

/**
 * PAD-578 (calendar.view rule 6, calendar.mobile-views rule 19): a student's own class is
 * ticked so telling it from an open spot never rests on colour alone.
 */
export function showsEnrolledMark(
  event: CalendarEvent,
  variant: CardVariant,
  viewer: CalendarViewer
): boolean {
  if (viewer !== "student" || event.type !== "class") return false;
  // An open spot, an invitation, a waiting place and a "Não vou" carry their chip; a canceled
  // class its red; a block is not a class. PAD-611: a missed class is the coach's record of an
  // absence — no ✓.
  if (["open-spot", "invited", "waiting", "not-coming", "canceled", "block"].includes(variant)) return false;
  const relation = event.studentRelation;
  return relation !== "missed" && relation !== "not_coming" && relation !== "invited" && relation !== "waiting" && relation !== "open_spot";
}


/**
 * PAD-611 (calendar.mobile-views rule 5): the chip a card carries for the student's relation —
 * one helper so both shells name it alike. The open spot keeps its PAD-130 test id.
 */
export function relationChip(variant: CardVariant): { key: string; testId: string } | null {
  switch (variant) {
    case "open-spot":
      return { key: "calendar.openSpot.chip", testId: "calendar-open-spot-chip" };
    case "invited":
      return { key: "calendar.relation.invited", testId: "calendar-relation-chip" };
    case "waiting":
      return { key: "calendar.relation.waiting", testId: "calendar-relation-chip" };
    case "not-coming":
      return { key: "calendar.relation.notComing", testId: "calendar-relation-chip" };
    default:
      return null;
  }
}
