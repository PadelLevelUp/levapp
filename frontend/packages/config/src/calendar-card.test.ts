import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import {
  cardSurfaceNative,
  cardSurfaceWeb,
  resolveCardVariant,
  filterStudentEvents,
  parseStudentFilter,
  relationChip,
  showsEnrolledMark,
  studentDotColorWeb,
  STUDENT_FILTER_DEFAULT,
  studentFilterStorageKey,
  studentLegendItems,
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
const NOW = new Date("2026-09-08T12:00:00+01:00"); // an instant: 12:00 on the club's clock

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

describe("resolveCardVariant — open spot (B-541, mobile-views rule 5 / open-spot-visibility rule 11)", () => {
  it("a class flagged openSpot is `open-spot`, and still short when it has room", () => {
    expect(
      resolveCardVariant(event({ openSpot: true, participantCount: 12, maxPlayers: 16 }), { now: NOW })
    ).toEqual({ variant: "open-spot", seatsShort: true });
  });

  it("an offer is never the student's next class: open-spot wins over next", () => {
    expect(resolveCardVariant(event({ openSpot: true }), { isNext: true, now: NOW }).variant).toBe(
      "open-spot"
    );
  });

  it("canceled still wins over open-spot", () => {
    expect(
      resolveCardVariant(event({ openSpot: true, status: "canceled" }), { now: NOW }).variant
    ).toBe("canceled");
  });
});

describe("showsEnrolledMark (PAD-578, calendar.view rule 6 / mobile-views rule 19)", () => {
  const e = event({ participantCount: 4 });
  it("a student's own scheduled, next or past class is ticked", () => {
    expect(showsEnrolledMark(e, "scheduled", "student")).toBe(true);
    expect(showsEnrolledMark(e, "next", "student")).toBe(true);
    expect(showsEnrolledMark(e, "past", "student")).toBe(true);
  });
  it("never an open spot, a canceled class or a block", () => {
    expect(showsEnrolledMark(event({ openSpot: true }), "open-spot", "student")).toBe(false);
    expect(showsEnrolledMark(event({ status: "canceled" }), "canceled", "student")).toBe(false);
    expect(showsEnrolledMark(event({ type: "block" }), "block", "student")).toBe(false);
  });
  it("never on a coach's calendar", () => {
    expect(showsEnrolledMark(e, "scheduled", "coach")).toBe(false);
  });
});

describe("a student's relation (PAD-611, calendar.view rule 22 / mobile-views rule 5)", () => {
  const hex = "#1355DC";
  const rel = (studentRelation: CalendarEvent["studentRelation"], extra: Partial<CalendarEvent> = {}) =>
    event({ studentRelation, participantCount: 3, ...extra });

  it("not_coming, invited and waiting have their own variants; enrolled stays scheduled", () => {
    expect(resolveCardVariant(rel("not_coming"), { now: NOW }).variant).toBe("not-coming");
    expect(resolveCardVariant(rel("invited"), { now: NOW }).variant).toBe("invited");
    expect(resolveCardVariant(rel("waiting"), { now: NOW }).variant).toBe("waiting");
    expect(resolveCardVariant(rel("enrolled"), { now: NOW }).variant).toBe("scheduled");
  });

  it("past wins once the class is over; canceled still wins", () => {
    expect(resolveCardVariant(rel("not_coming", { status: "completed" }), { now: NOW }).variant).toBe("past");
    expect(resolveCardVariant(rel("invited", { status: "canceled" }), { now: NOW }).variant).toBe("canceled");
  });

  it("surfaces: not-coming is faded with muted text; invited is the dashed outline; waiting is dotted and muted", () => {
    expect(cardSurfaceWeb(hex, "not-coming")).toEqual(cardSurfaceWeb(hex, "past"));
    expect(cardSurfaceWeb(hex, "invited")).toEqual(cardSurfaceWeb(hex, "open-spot"));
    expect(cardSurfaceWeb(hex, "waiting")).toEqual({
      backgroundColor: "hsl(var(--card))",
      border: "1.5px dotted hsl(var(--muted-foreground))",
      color: "hsl(var(--muted-foreground))",
    });
    expect(cardSurfaceNative(hex, "not-coming", SURFACES)).toEqual(cardSurfaceNative(hex, "past", SURFACES));
    expect(cardSurfaceNative(hex, "invited", SURFACES)).toEqual(cardSurfaceNative(hex, "open-spot", SURFACES));
    expect(cardSurfaceNative(hex, "waiting", SURFACES)).toEqual({
      backgroundColor: SURFACES.card,
      borderWidth: 1.5,
      borderStyle: "dotted",
      borderColor: SURFACES.mutedForeground,
      color: SURFACES.mutedForeground,
    });
  });

  it("the ✓ only on what the student is going to or went to", () => {
    expect(showsEnrolledMark(rel("enrolled"), "scheduled", "student")).toBe(true);
    expect(showsEnrolledMark(rel("attended", { status: "completed" }), "past", "student")).toBe(true);
    expect(showsEnrolledMark(rel("missed", { status: "completed" }), "past", "student")).toBe(false);
    expect(showsEnrolledMark(rel("not_coming"), "not-coming", "student")).toBe(false);
    expect(showsEnrolledMark(rel("invited"), "invited", "student")).toBe(false);
    expect(showsEnrolledMark(rel("waiting"), "waiting", "student")).toBe(false);
  });

  it("each relation variant names its chip", () => {
    expect(relationChip("open-spot")).toEqual({ key: "calendar.openSpot.chip", testId: "calendar-open-spot-chip" });
    expect(relationChip("invited")).toEqual({ key: "calendar.relation.invited", testId: "calendar-relation-chip" });
    expect(relationChip("waiting")).toEqual({ key: "calendar.relation.waiting", testId: "calendar-relation-chip" });
    expect(relationChip("not-coming")).toEqual({ key: "calendar.relation.notComing", testId: "calendar-relation-chip" });
    expect(relationChip("scheduled")).toBeNull();
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

  it("open-spot: card surface, 1.5px dashed outline in the coach colour, readable ink (B-541)", () => {
    expect(cardSurfaceWeb(hex, "open-spot")).toEqual({
      backgroundColor: "hsl(var(--card))",
      border: `1.5px dashed ${hex}`,
      color: readableInk(hex),
    });
    expect(cardSurfaceWeb(undefined, "open-spot")).toEqual({
      backgroundColor: "hsl(var(--card))",
      border: "1.5px dashed hsl(var(--primary))",
      color: "hsl(var(--primary))",
    });
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

  it("open-spot: card surface, 1.5pt dashed border, readable ink — never the solid surface's white (B-541)", () => {
    expect(cardSurfaceNative("#1355DC", "open-spot", SURFACES)).toEqual({
      backgroundColor: SURFACES.card,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: "#1355DC",
      color: readableInkNative("#1355DC", SURFACES),
    });
    expect(cardSurfaceNative("#1355DC", "open-spot", SURFACES).color).not.toBe("#FFFFFF");
    expect(cardSurfaceNative(undefined, "open-spot", SURFACES)).toEqual({
      backgroundColor: SURFACES.card,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: lightTheme.primary,
      color: lightTheme.primary,
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

/**
 * PAD-664 (calendar.view rule 23): for a STUDENT viewer the colour says the relation, never the
 * coach — blue `primary` for their own, grey for an open spot, amber for full / waiting; amber
 * never on the seat count. The coach viewer is unchanged (the suites above pass no viewer).
 */
describe("the student's palette (PAD-664, calendar.view rule 23)", () => {
  const TEAL = "#0D9488";
  const own = (relation: CalendarEvent["studentRelation"], over: Partial<CalendarEvent> = {}) =>
    event({ color: TEAL, studentRelation: relation, ...over });
  const offer = (relation: "open_spot" | "full", over: Partial<CalendarEvent> = {}) =>
    event({ color: TEAL, openSpot: true, studentRelation: relation, ...over });

  it("a full class the student is not in is `full`; canceled and past still win", () => {
    expect(resolveCardVariant(offer("full"), { now: NOW, viewer: "student" }).variant).toBe("full");
    expect(resolveCardVariant(offer("full", { status: "canceled" }), { now: NOW, viewer: "student" }).variant).toBe("canceled");
    expect(resolveCardVariant(offer("full", { date: "2026-09-01" }), { now: NOW, viewer: "student" }).variant).toBe("past");
  });

  it("seats are never short on a student's calendar — amber means full", () => {
    const roomy = offer("open_spot", { participantCount: 2, maxPlayers: 6 });
    expect(resolveCardVariant(roomy, { now: NOW }).seatsShort).toBe(true); // control: coach reading
    expect(resolveCardVariant(roomy, { now: NOW, viewer: "student" }).seatsShort).toBe(false);
    expect(resolveCardVariant(own("enrolled", { participantCount: 2 }), { now: NOW, viewer: "student" }).seatsShort).toBe(false);
  });

  it("web: no student surface carries the coach colour; each family has its own colour", () => {
    const variants = ["scheduled", "next", "past", "not-coming", "invited", "open-spot", "full", "waiting"] as const;
    for (const v of variants) {
      expect(JSON.stringify(cardSurfaceWeb(TEAL, v, "student"))).not.toContain(TEAL);
    }
    expect(cardSurfaceWeb(TEAL, "scheduled", "student").backgroundColor).toBe("hsl(var(--primary))");
    expect(cardSurfaceWeb(TEAL, "invited", "student").border).toBe("1.5px dashed hsl(var(--primary))");
    expect(cardSurfaceWeb(TEAL, "open-spot", "student").border).toBe("1.5px dashed hsl(var(--muted-foreground))");
    expect(cardSurfaceWeb(TEAL, "full", "student")).toEqual({
      backgroundColor: "color-mix(in srgb, hsl(var(--warning)) 18%, hsl(var(--card)))",
      border: "1.5px solid hsl(var(--warning))",
      color: "hsl(var(--warning-strong))",
    });
    expect(cardSurfaceWeb(TEAL, "waiting", "student").border).toBe("1.5px dotted hsl(var(--warning))");
    // control: the coach keeps teal
    expect(cardSurfaceWeb(TEAL, "scheduled").backgroundColor).toBe(TEAL);
  });

  it("native: the same families, resolved to concrete colours", () => {
    expect(cardSurfaceNative(TEAL, "scheduled", SURFACES, "student").backgroundColor).toBe(lightTheme.primary);
    // White ink is written "#FFFFFF", the form EventCard's onColor test compares against.
    expect(cardSurfaceNative(TEAL, "scheduled", SURFACES, "student").color).toBe("#FFFFFF");
    expect(cardSurfaceNative(TEAL, "open-spot", SURFACES, "student")).toMatchObject({
      borderStyle: "dashed", borderColor: SURFACES.mutedForeground, backgroundColor: SURFACES.card,
    });
    expect(cardSurfaceNative(TEAL, "full", SURFACES, "student")).toMatchObject({
      borderColor: lightTheme.warning, color: lightTheme.warningStrong,
    });
    expect(cardSurfaceNative(TEAL, "waiting", SURFACES, "student")).toMatchObject({
      borderStyle: "dotted", borderColor: lightTheme.warning,
    });
    expect(cardSurfaceNative(TEAL, "scheduled", SURFACES).backgroundColor).toBe(TEAL);
  });

  it("the full card says so in words and carries no ✓", () => {
    expect(relationChip("full")).toEqual({ key: "calendar.relation.full", testId: "calendar-relation-chip" });
    expect(showsEnrolledMark(offer("full"), "full", "student")).toBe(false);
  });

  it("the dot of an outlined student variant is its outline colour", () => {
    expect(studentDotColorWeb("open-spot")).toBe("hsl(var(--muted-foreground))");
    expect(studentDotColorWeb("full")).toBe("hsl(var(--warning))");
    expect(studentDotColorWeb("waiting")).toBe("hsl(var(--warning))");
    expect(studentDotColorWeb("invited")).toBe("hsl(var(--primary))");
  });
});

describe("the student's filter and legend (PAD-664, calendar.view rule 23)", () => {
  const evs = [
    event({ id: "e", studentRelation: "enrolled" }),
    event({ id: "i", studentRelation: "invited" }),
    event({ id: "w", studentRelation: "waiting" }),
    event({ id: "n", studentRelation: "not_coming" }),
    event({ id: "o", openSpot: true, studentRelation: "open_spot" }),
    event({ id: "o2", openSpot: true }), // a server older than PAD-611
    event({ id: "f", openSpot: true, studentRelation: "full" }),
    event({ id: "b", type: "block", model: "CalendarBlock" }),
  ];

  it("'mine' hides only the offers — never an invitation or a waiting place", () => {
    expect(filterStudentEvents(evs, "mine").map((e) => e.id)).toEqual(["e", "i", "w", "n", "b"]);
    expect(filterStudentEvents(evs, "eligible")).toHaveLength(evs.length);
  });

  it("the stored choice parses back, and anything else is the default", () => {
    expect(STUDENT_FILTER_DEFAULT).toBe("eligible");
    expect(parseStudentFilter("mine")).toBe("mine");
    expect(parseStudentFilter("eligible")).toBe("eligible");
    expect(parseStudentFilter(null)).toBe("eligible");
    expect(parseStudentFilter("junk")).toBe("eligible");
    expect(studentFilterStorageKey(42)).toBe("levapp.calendar.studentFilter.42");
  });

  it("the legend lists only what the filter leaves visible", () => {
    expect(studentLegendItems("eligible").map((i) => i.variant)).toEqual([
      "scheduled", "invited", "waiting", "not-coming", "open-spot", "full",
    ]);
    expect(studentLegendItems("mine").map((i) => i.variant)).toEqual(["scheduled", "invited", "waiting", "not-coming"]);
    expect(studentLegendItems("eligible").every((i) => i.key.startsWith("calendar.legend.student."))).toBe(true);
  });
});
