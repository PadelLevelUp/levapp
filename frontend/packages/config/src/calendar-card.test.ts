import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import {
  cardSurfaceNative,
  cardSurfaceWeb,
  resolveCardVariant,
} from "./calendar-card";
import {
  contrastTextOn,
  contrastTextOnNative,
  fadeColor,
  fadeColorNative,
  nativeCalendarSurfaces,
  readableInk,
  readableInkNative,
} from "./calendar-status";
import { lightTheme } from "./tokens";

/**
 * calendar.mobile-views rules 5 and 7: the coach's colour identifies a class,
 * the treatment carries its state, and amber only ever touches the seat count.
 *
 * Criteria: "Coach colour identifies, state treats", "Next class is outlined,
 * not filled", "Canceled is red and only red is canceled", "Empty seats go
 * amber on the bar, not on the card".
 */
const NOW = new Date("2026-09-08T12:00:00");

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    model: "LessonInstance",
    originalId: 1,
    id: "class-1",
    type: "class",
    isRecurring: false,
    title: "Preparação Mundial",
    date: "2026-09-08",
    startTime: "14:00",
    endTime: "15:30",
    color: "#0D9488",
    status: "scheduled",
    participantCount: 6,
    maxPlayers: 6,
    ...overrides,
  };
}

const SURFACES = nativeCalendarSurfaces("light");

describe("resolveCardVariant", () => {
  it("a scheduled class in the future is `scheduled` and full when 6/6", () => {
    expect(resolveCardVariant(event(), { now: NOW })).toEqual({
      variant: "scheduled",
      seatsShort: false,
    });
  });

  it("the flagged next class is `next`", () => {
    expect(resolveCardVariant(event(), { now: NOW, isNext: true }).variant).toBe(
      "next"
    );
  });

  it("a completed class is `past` and never short", () => {
    const done = event({
      status: "completed",
      startTime: "08:00",
      endTime: "09:00",
      participantCount: 2,
    });
    expect(resolveCardVariant(done, { now: NOW })).toEqual({
      variant: "past",
      seatsShort: false,
    });
  });

  it("a class whose end time has passed is `past` even without a status", () => {
    const ended = event({ status: undefined, startTime: "08:00", endTime: "09:00" });
    expect(resolveCardVariant(ended, { now: NOW }).variant).toBe("past");
  });

  it("a canceled class is `canceled` and never short", () => {
    const canceled = event({ status: "canceled", participantCount: 1 });
    expect(resolveCardVariant(canceled, { now: NOW })).toEqual({
      variant: "canceled",
      seatsShort: false,
    });
  });

  it("a calendar block is `block`", () => {
    const block = event({ type: "block", blockType: "break", maxPlayers: undefined });
    expect(resolveCardVariant(block, { now: NOW }).variant).toBe("block");
  });

  it("empty seats make a scheduled or next class short", () => {
    const short = event({ participantCount: 3 });
    expect(resolveCardVariant(short, { now: NOW }).seatsShort).toBe(true);
    expect(resolveCardVariant(short, { now: NOW, isNext: true }).seatsShort).toBe(
      true
    );
  });
});

describe("cardSurfaceWeb", () => {
  const hex = "#6366F1";

  it("scheduled: solid coach colour, text by contrast", () => {
    expect(cardSurfaceWeb(hex, "scheduled")).toEqual({
      backgroundColor: hex,
      color: contrastTextOn(hex),
    });
  });

  it("next: card surface with a 1.5px outline in the coach colour", () => {
    expect(cardSurfaceWeb(hex, "next")).toEqual({
      backgroundColor: "hsl(var(--card))",
      border: `1.5px solid ${hex}`,
      color: readableInk(hex),
    });
  });

  it("past: faded coach colour with muted text", () => {
    expect(cardSurfaceWeb(hex, "past")).toEqual({
      backgroundColor: fadeColor(hex),
      color: "hsl(var(--muted-foreground))",
      border: "1px solid hsl(var(--border))",
    });
  });

  it("canceled: the destructive surface regardless of the coach colour", () => {
    expect(cardSurfaceWeb(hex, "canceled")).toEqual({
      backgroundColor: "hsl(var(--destructive))",
      color: "hsl(var(--destructive-foreground))",
    });
    expect(cardSurfaceWeb(undefined, "canceled")).toEqual(
      cardSurfaceWeb("#0D9488", "canceled")
    );
  });

  it("block: nothing inline — the dashed treatment is class-driven", () => {
    expect(cardSurfaceWeb(hex, "block")).toEqual({});
  });

  it("no colour: falls back to the primary token", () => {
    expect(cardSurfaceWeb(undefined, "scheduled")).toEqual({
      backgroundColor: "hsl(var(--primary))",
      color: "hsl(var(--primary-foreground))",
    });
  });
});

describe("cardSurfaceNative", () => {
  const hex = "#0D9488";

  it("scheduled: solid coach colour with the native contrast text", () => {
    expect(cardSurfaceNative(hex, "scheduled", SURFACES)).toEqual({
      backgroundColor: hex,
      color: contrastTextOnNative(hex, SURFACES),
    });
  });

  it("next: card surface, 1.5pt border, readable ink", () => {
    expect(cardSurfaceNative(hex, "next", SURFACES)).toEqual({
      backgroundColor: SURFACES.card,
      borderWidth: 1.5,
      borderColor: hex,
      color: readableInkNative(hex, SURFACES),
    });
  });

  it("past: faded colour, muted text, hairline edge", () => {
    expect(cardSurfaceNative(hex, "past", SURFACES)).toEqual({
      backgroundColor: fadeColorNative(hex, SURFACES),
      color: SURFACES.mutedForeground,
      borderWidth: 1,
      borderColor: lightTheme.border,
    });
  });

  it("canceled: destructive tokens", () => {
    expect(cardSurfaceNative(hex, "canceled", SURFACES)).toEqual({
      backgroundColor: lightTheme.destructive,
      color: lightTheme.destructiveForeground,
    });
  });

  it("no colour: primary token", () => {
    expect(cardSurfaceNative(undefined, "scheduled", SURFACES)).toEqual({
      backgroundColor: lightTheme.primary,
      color: lightTheme.primaryForeground,
    });
  });

  it("agrees with the web path on whether text is white", () => {
    for (const c of ["#1355DC", "#0EA5E9", "#A21CAF", "#475569"]) {
      const web = cardSurfaceWeb(c, "scheduled").color === "#FFFFFF";
      const native = cardSurfaceNative(c, "scheduled", SURFACES).color === "#FFFFFF";
      expect(native).toBe(web);
    }
  });
});
