import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "@/types";
import {
  contrastTextOn,
  readableInk,
  fadeColor,
  findNextEventId,
  hasOpenSpots,
  resolveEventState,
} from "./calendar-status";

/** The 8 hexes a coach can actually pick in AddClassSheet / ClassDetailSheet. */
const SWATCHES = [
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#ef4444",
  "#6366f1",
];

const INK = "#101E33"; // --foreground

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    model: "class_instance",
    originalId: 1,
    id: "e1",
    type: "class",
    isRecurring: false,
    title: "Aula",
    date: "2026-08-20",
    startTime: "10:00",
    endTime: "11:00",
    participantCount: 2,
    maxPlayers: 6,
    ...over,
  } as CalendarEvent;
}

describe("contrastTextOn", () => {
  it("picks whichever of ink/white actually reads, for every swatch", () => {
    // This is the whole point: the coach picks the colour, so the label colour
    // cannot be hardcoded. The old code always used white, which is 2.8:1 on
    // the orange swatch.
    for (const hex of SWATCHES) {
      const picked = contrastTextOn(hex);
      const chosenIsInk = picked !== "#FFFFFF";
      const inkRatio = contrast(luminance(hex), luminance(INK));
      const whiteRatio = contrast(luminance(hex), 1);
      const better = inkRatio >= whiteRatio;
      expect(chosenIsInk, `${hex}: ink ${inkRatio.toFixed(2)} vs white ${whiteRatio.toFixed(2)}`).toBe(better);
    }
  });

  it("clears 4:1 on every swatch", () => {
    for (const hex of SWATCHES) {
      const ratio = Math.max(
        contrast(luminance(hex), luminance(INK)),
        contrast(luminance(hex), 1)
      );
      expect(ratio, hex).toBeGreaterThan(4);
    }
  });

  it("falls back to the card colour when there is no hex", () => {
    expect(contrastTextOn(undefined)).toBe("hsl(var(--card))");
    expect(contrastTextOn("not-a-colour")).toBe("hsl(var(--card))");
  });
});

describe("fadeColor", () => {
  it("blends toward the card surface, not toward white", () => {
    // Theme-aware by construction: --card is white in the light theme and
    // navy in the dark one, so a finished class recedes in both. An earlier
    // version always lightened and made spent classes the brightest blocks
    // on a dark grid.
    const faded = fadeColor("#1355DC")!;
    expect(faded).toBe("color-mix(in srgb, #1355DC 22%, hsl(var(--card)))");
  });

  it("keeps most of the surface, so the hue survives but the chroma does not", () => {
    for (const hex of SWATCHES) {
      const m = /^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, hsl\(var\(--card\)\)\)$/i.exec(
        fadeColor(hex)!
      );
      expect(m, hex).not.toBeNull();
      expect(m![1].toLowerCase()).toBe(hex.toLowerCase());
      expect(Number(m![2]), `${hex} retained chroma`).toBeLessThanOrEqual(30);
    }
  });

  it("returns undefined without a hex, so the caller keeps its token styling", () => {
    expect(fadeColor(undefined)).toBeUndefined();
    expect(fadeColor("nope")).toBeUndefined();
  });
});

describe("readableInk", () => {
  it("keeps the class's hue but blends it toward the foreground", () => {
    expect(readableInk("#eab308")).toBe(
      "color-mix(in srgb, #eab308 55%, hsl(var(--foreground)))"
    );
  });

  it("clears 4.5:1 on the card in BOTH themes, for every swatch", () => {
    // The next class is a white body with its colour as the border, so the
    // label carries that colour too. The raw hex cannot: yellow on white is
    // 1.9:1. 55% is the most colour that survives the check — the binding
    // case is yellow on the light theme at 4.79.
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const relLum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) =>
      (Math.max(relLum(a), relLum(b)) + 0.05) / (Math.min(relLum(a), relLum(b)) + 0.05);
    const mix = (a: number[], b: number[], p: number) => a.map((v, i) => v * p + b[i] * (1 - p));

    const THEMES = [
      { card: rgb("#FFFFFF"), fg: rgb("#101E33") }, // light
      { card: rgb("#0F1B2E"), fg: rgb("#F2F6FC") }, // dark
    ];
    for (const hex of SWATCHES) {
      const m = /(#[0-9a-f]{6}) (\d+)%/i.exec(readableInk(hex)!)!;
      const pct = Number(m[2]) / 100;
      for (const { card, fg } of THEMES) {
        expect(ratio(mix(rgb(hex), fg, pct), card), `${hex}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("returns undefined without a hex, so the caller keeps its token colour", () => {
    expect(readableInk(undefined)).toBeUndefined();
    expect(readableInk("nope")).toBeUndefined();
  });
});

describe("resolveEventState", () => {
  const now = new Date("2026-08-20T12:00:00");

  it("treats a finished class as past even without a completed status", () => {
    const e = event({ date: "2026-08-20", startTime: "09:00", endTime: "10:00" });
    expect(resolveEventState(e, { now })).toBe("past");
  });

  it("honours an explicit completed status regardless of the clock", () => {
    const e = event({ date: "2026-08-20", startTime: "14:00", endTime: "15:00", status: "completed" });
    expect(resolveEventState(e, { now })).toBe("past");
  });

  it("puts canceled and block ahead of everything else", () => {
    expect(resolveEventState(event({ status: "canceled" }), { now })).toBe("canceled");
    expect(resolveEventState(event({ type: "block" }), { now })).toBe("block");
  });

  it("marks the flagged event next, and leaves others future", () => {
    const e = event({ startTime: "14:00", endTime: "15:00" });
    expect(resolveEventState(e, { now, isNext: true })).toBe("next");
    expect(resolveEventState(e, { now, isNext: false })).toBe("future");
  });

  it("does NOT let open spots displace the state", () => {
    // Regression: an earlier cut made "open" a rival state, so a next class
    // with holes lost its next treatment — on the most urgent class there is.
    const e = event({ startTime: "14:00", endTime: "15:00", participantCount: 1, maxPlayers: 6 });
    expect(hasOpenSpots(e)).toBe(true);
    expect(resolveEventState(e, { now, isNext: true })).toBe("next");
  });
});

describe("hasOpenSpots", () => {
  it("is true only for a class with seats left", () => {
    expect(hasOpenSpots(event({ participantCount: 2, maxPlayers: 6 }))).toBe(true);
    expect(hasOpenSpots(event({ participantCount: 6, maxPlayers: 6 }))).toBe(false);
    expect(hasOpenSpots(event({ type: "block" }))).toBe(false);
    expect(hasOpenSpots(event({ participantCount: undefined }))).toBe(false);
    expect(hasOpenSpots(event({ maxPlayers: 0 }))).toBe(false);
  });
});

describe("findNextEventId", () => {
  const now = new Date("2026-08-20T12:00:00");

  it("returns the soonest class that has not finished", () => {
    const past = event({ id: "past", startTime: "09:00", endTime: "10:00" });
    const soon = event({ id: "soon", startTime: "14:00", endTime: "15:00" });
    const later = event({ id: "later", startTime: "18:00", endTime: "19:00" });
    expect(findNextEventId([later, past, soon], now)).toBe("soon");
  });

  it("skips canceled, completed and non-class events", () => {
    const canceled = event({ id: "c", startTime: "13:00", endTime: "14:00", status: "canceled" });
    const done = event({ id: "d", startTime: "13:30", endTime: "14:30", status: "completed" });
    const block = event({ id: "b", startTime: "13:45", endTime: "14:45", type: "block" });
    const real = event({ id: "r", startTime: "16:00", endTime: "17:00" });
    expect(findNextEventId([canceled, done, block, real], now)).toBe("r");
  });

  it("returns undefined when nothing is upcoming", () => {
    expect(findNextEventId([event({ startTime: "08:00", endTime: "09:00" })], now)).toBeUndefined();
    expect(findNextEventId([], now)).toBeUndefined();
  });
});
