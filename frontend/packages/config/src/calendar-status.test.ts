import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import {
  contrastTextOn,
  contrastTextOnNative,
  fadeColor,
  fadeColorNative,
  findNextEventId,
  hasOpenSpots,
  mixColors,
  nativeCalendarSurfaces,
  parseColor,
  readableInk,
  readableInkNative,
  relativeLuminance,
  resolveEventState,
  withAlpha,
  FADE_MIX_PERCENT,
  FILL_AWAITING_ALPHA,
  READABLE_INK_MIX_PERCENT,
} from "./calendar-status";
import { darkTheme, lightTheme } from "./tokens";

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

/* ── the native half ───────────────────────────────────────────────────────
 *
 * Everything above proves the WEB NOTATION. React Native cannot parse
 * `color-mix()` or `hsl(var(--token))`, so the native emitters do the same
 * arithmetic against resolved token colours. These tests exist to prove the
 * two paths agree — the whole reason the module was lifted out of apps/web.
 */

const LIGHT = nativeCalendarSurfaces("light");
const DARK = nativeCalendarSurfaces("dark");

/** Contrast ratio between two colours in any notation `parseColor` accepts. */
function ratioOf(a: string, b: string): number {
  const ra = parseColor(a)!;
  const rb = parseColor(b)!;
  return contrast(relativeLuminance(ra), relativeLuminance(rb));
}

describe("parseColor", () => {
  it("reads the hsl(...) strings tokens.ts emits, not just hexes", () => {
    // `lightTheme.card` is "hsl(0 0% 100%)". If this regressed to null, every
    // native blend below would silently return undefined — which React Native
    // renders as transparent, with no error.
    expect(lightTheme.card).toMatch(/^hsl\(/);
    expect(parseColor(lightTheme.card)).toEqual([255, 255, 255]);
    expect(parseColor(darkTheme.card)).not.toBeNull();

    // The ink token is stored as HSL ("216 52% 13%") and documented as
    // #101E33, but 13% lightness rounds to a blue channel of 50, not 51. The
    // token is the source of truth and the 1/255 gap is invisible; asserting
    // exact equality here would only encode the doc comment's rounding.
    const fg = parseColor(lightTheme.foreground)!;
    const documented = parseColor("#101E33")!;
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(fg[i] - documented[i]), `channel ${i}`).toBeLessThanOrEqual(1);
    }
  });

  it("accepts the comma form and rejects CSS variables outright", () => {
    expect(parseColor("hsl(0, 0%, 100%)")).toEqual([255, 255, 255]);
    // A var() reference has no value outside a browser. Returning null is what
    // makes the native emitters fail loudly in tests rather than at runtime.
    expect(parseColor("hsl(var(--card))")).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
});

describe("mixColors matches CSS color-mix arithmetic", () => {
  it("reproduces the percentage the web string declares", () => {
    // CSS `color-mix(in srgb, A p%, B)` interpolates gamma-encoded sRGB —
    // channel-wise `a*p + b*(1-p)`, which is exactly what mixColors does. This
    // pins the equivalence instead of assuming it.
    for (const hex of SWATCHES) {
      const declared = /(#[0-9a-f]{6}) (\d+)%/i.exec(fadeColor(hex)!)!;
      const pct = Number(declared[2]);
      expect(pct).toBe(FADE_MIX_PERCENT);

      const a = parseColor(hex)!;
      const b = parseColor(lightTheme.card)!;
      const expected = a.map((v, i) => Math.round(v * (pct / 100) + b[i] * (1 - pct / 100)));
      expect(parseColor(mixColors(hex, lightTheme.card, pct)!), hex).toEqual(expected);
    }
  });

  it("returns undefined when either side is unparseable", () => {
    expect(mixColors("nope", lightTheme.card, 50)).toBeUndefined();
    expect(mixColors("#eab308", "hsl(var(--card))", 50)).toBeUndefined();
  });
});

describe("contrastTextOnNative", () => {
  it("agrees with the web emitter on ink-vs-white for every swatch", () => {
    // The drift this module exists to prevent: if these two ever disagreed, a
    // class would be legible on one platform and not the other.
    for (const hex of SWATCHES) {
      const webIsWhite = contrastTextOn(hex) === "#FFFFFF";
      const nativeIsWhite = contrastTextOnNative(hex, LIGHT) === "#FFFFFF";
      expect(nativeIsWhite, hex).toBe(webIsWhite);
    }
  });

  it("returns a colour React Native can actually parse", () => {
    for (const hex of [...SWATCHES, undefined, "nope"]) {
      const picked = contrastTextOnNative(hex, LIGHT);
      expect(parseColor(picked), String(hex)).not.toBeNull();
    }
  });

  it("clears 4:1 against the block it sits on, for every swatch", () => {
    for (const hex of SWATCHES) {
      expect(ratioOf(contrastTextOnNative(hex, LIGHT), hex), hex).toBeGreaterThan(4);
    }
  });
});

describe("readableInkNative", () => {
  it("clears 4.5:1 on the real card token, in both themes", () => {
    // Measured against `lightTheme.card` / `darkTheme.card` rather than a
    // hardcoded #FFFFFF — a hardcoded surface is how the two would drift back
    // apart the next time a token moves.
    for (const hex of SWATCHES) {
      for (const [name, s] of [["light", LIGHT], ["dark", DARK]] as const) {
        const ink = readableInkNative(hex, s);
        expect(ink, `${hex} ${name}`).toBeDefined();
        expect(ratioOf(ink!, s.card), `${hex} on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("uses the same mix percentage the web emitter declares", () => {
    for (const hex of SWATCHES) {
      const pct = Number(/(#[0-9a-f]{6}) (\d+)%/i.exec(readableInk(hex)!)![2]);
      expect(pct).toBe(READABLE_INK_MIX_PERCENT);
      expect(readableInkNative(hex, LIGHT)).toBe(
        mixColors(hex, LIGHT.foreground, pct)
      );
    }
  });

  it("returns undefined without a usable hex, so the caller keeps its token colour", () => {
    expect(readableInkNative(undefined, LIGHT)).toBeUndefined();
    expect(readableInkNative("nope", LIGHT)).toBeUndefined();
  });
});

describe("fadeColorNative", () => {
  it("recedes toward the card in both themes rather than always lightening", () => {
    // On light, a faded block must be LIGHTER than the raw swatch; on dark it
    // must be DARKER. The old always-lighten version made spent classes the
    // brightest thing on a dark grid.
    for (const hex of SWATCHES) {
      const raw = relativeLuminance(parseColor(hex)!);
      const onLight = relativeLuminance(parseColor(fadeColorNative(hex, LIGHT)!)!);
      const onDark = relativeLuminance(parseColor(fadeColorNative(hex, DARK)!)!);
      expect(onLight, `${hex} light`).toBeGreaterThan(raw);
      expect(onDark, `${hex} dark`).toBeLessThan(raw);
    }
  });

  it("returns undefined without a usable hex", () => {
    expect(fadeColorNative(undefined, LIGHT)).toBeUndefined();
    expect(fadeColorNative("nope", LIGHT)).toBeUndefined();
  });
});

describe("withAlpha", () => {
  it("produces an rgba() the fill bar can use in place of currentColor", () => {
    // React Native has no colour inheritance for backgroundColor and no
    // color-mix(..., transparent), so the three fill segments are built from
    // explicit alphas of the already-legible ink.
    expect(withAlpha("#1355DC", FILL_AWAITING_ALPHA)).toBe("rgba(19, 85, 220, 0.62)");
    expect(withAlpha(lightTheme.card, 0.3)).toBe("rgba(255, 255, 255, 0.3)");
  });

  it("returns undefined rather than an unparseable string", () => {
    // An undefined backgroundColor renders transparent in RN with no error, so
    // callers must default; this asserts the failure is at least detectable.
    expect(withAlpha("hsl(var(--foreground))", 0.5)).toBeUndefined();
    expect(withAlpha(undefined, 0.5)).toBeUndefined();
  });
});

/**
 * PAD-295 / B-066 — calendar.view rule 16, criterion "Past and next are judged on
 * the club's clock on any device". Stored times are Lisbon wall-clock digits, so
 * the default `now` must be the club's clock, not the device's. Run under
 * `TZ=Asia/Tokyo` or `TZ=America/Sao_Paulo` this fails on device-time code and
 * passes in Lisbon and UTC — exactly the bug.
 */
describe("resolveEventState / findNextEventId default to the club's clock (PAD-295)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 09:00 UTC on 15 July 2027 = 10:00 in Lisbon (summer).
    vi.setSystemTime(new Date(Date.UTC(2027, 6, 15, 9, 0)));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a class starting in 30 Lisbon minutes is upcoming and next, whatever the device zone", () => {
    const e = event({ id: "soon", date: "2027-07-15", startTime: "10:30", endTime: "11:30" });
    expect(resolveEventState(e)).toBe("future");
    expect(findNextEventId([e])).toBe("soon");
  });

  it("a class that ended 30 Lisbon minutes ago is past, whatever the device zone", () => {
    const e = event({ id: "done", date: "2027-07-15", startTime: "08:30", endTime: "09:30" });
    expect(resolveEventState(e)).toBe("past");
    expect(findNextEventId([e])).toBeUndefined();
  });
});
