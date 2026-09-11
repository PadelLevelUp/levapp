import type { CalendarEvent } from "@levelup/types";
import { lisbonNowMs, wallClockMs } from "./club-date";
import { darkTheme, lightTheme } from "./tokens";

/**
 * Calendar colour is USER DATA — the coach picks a hex per class from a swatch
 * palette — so it identifies a class, it does not report its state. That left
 * a full class, an empty one and a finished one looking identical.
 *
 * This module keeps the coach's colour as identity and lets *style* carry the
 * state: fill, fade, border and text contrast. Because the hex is arbitrary,
 * nothing here may assume white text reads on it — contrast is computed.
 *
 * ── Why this lives in `@levelup/config` ──────────────────────────────────
 *
 * It used to live in `apps/web/src/lib/calendar-status.ts`, and mobile had its
 * own calendar with none of it. The two platforms drifted within a day: the
 * "next class" gate was `weekDays.some(isToday)` on desktop and
 * `isToday(selectedDay)` on mobile, so tapping the day the next class actually
 * fell on showed nothing. Every rule below is now decided exactly once.
 *
 * ── Web vs native ────────────────────────────────────────────────────────
 *
 * The *decisions* are platform-neutral; only the notation differs. Web emits
 * CSS (`color-mix()` over `hsl(var(--token))`) so the browser re-resolves the
 * blend when the theme flips, with no JS involved. React Native cannot parse
 * either construct, so the `*Native` emitters do the same arithmetic in JS
 * against resolved surface colours and return concrete `#rrggbb` / `rgba()`.
 *
 * Both read the SAME constants — `INK_CROSSOVER_LUMINANCE`,
 * `FADE_MIX_PERCENT`, `READABLE_INK_MIX_PERCENT`. Two emitters that each
 * hardcoded "22%" is exactly the drift this move exists to stop.
 *
 * CSS `color-mix(in srgb, A p%, B)` interpolates gamma-encoded sRGB channels,
 * which is the same `a*p + b*(1-p)` the native path does — so the two are
 * equivalent by construction, not merely similar. `calendar-status.test.ts`
 * asserts the agreement rather than trusting it.
 */

export type EventVisualState =
  | "block" // not a class: a busy/unavailable block
  | "canceled"
  | "past" // already finished — faded
  | "next" // the soonest upcoming class — white body, coloured border
  | "future"; // upcoming — solid colour

/**
 * Whether a class still needs filling is INDEPENDENT of which state it is in:
 * the next class can also have holes, and that combination is the most urgent
 * thing on the grid. It is layered as a ring rather than replacing the state.
 */

/* ── shared constants ──────────────────────────────────────────────────── */

/**
 * The luminance at which ink and white give EQUAL contrast:
 *   white: 1.05 / (L + 0.05)        ink: (L + 0.05) / (L_ink + 0.05)
 * solving gives L = sqrt(1.05 * (L_ink + 0.05)) - 0.05.
 *
 * The familiar 0.179 assumes pure black. Our ink is #101E33 (L = 0.0128),
 * which moves the crossover to 0.2067 — and that difference decides the
 * indigo and violet swatches, where white genuinely wins.
 *
 * Checked against all 8 swatches a coach can pick: worst case 4.23:1.
 */
export const INK_CROSSOVER_LUMINANCE = 0.2067;

/**
 * How much of the class colour a finished class keeps. ~22% means the hue
 * survives (blue still reads as blue-grey) while the chroma drops away.
 */
export const FADE_MIX_PERCENT = 22;

/**
 * How much of the class colour survives when it has to work as text on the
 * card. 55% is the most that can be kept while clearing 4.5:1 across all
 * eight swatches in both themes; the binding case is yellow at 4.79 on light.
 */
export const READABLE_INK_MIX_PERCENT = 55;

/** Fill-bar track: the seats still free. */
export const FILL_TRACK_ALPHA = 0.3;
/** Fill-bar middle segment: enrolled but not yet answered. */
export const FILL_AWAITING_ALPHA = 0.62;

/* ── colour maths (platform-neutral) ───────────────────────────────────── */

export type Rgb = [number, number, number];

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function parseHslString(value: string): Rgb | null {
  // `hsl(216 52% 13%)` — the shape `tokens.ts` emits — and the legacy
  // comma-separated `hsl(216, 52%, 13%)`.
  const m = /^hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/i.exec(
    value.trim()
  );
  if (!m) return null;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}

/**
 * Any colour notation this codebase actually produces: a hex swatch from the
 * coach, or an `hsl(...)` token string from `tokens.ts`. Returns null for
 * anything else — including the CSS-variable forms, which have no value until
 * a browser resolves them, and so must never reach the native path.
 */
export function parseColor(value: string | undefined): Rgb | null {
  if (!value) return null;
  return parseHex(value) ?? parseHslString(value);
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Does white read better than ink on `hex`? Null when the colour cannot be
 * parsed, so callers can fall back rather than guess.
 *
 * THE decision both platforms have to agree on: the old code hardcoded white
 * on every class block. That is fine on the navy and red swatches and poor on
 * the yellow and lime ones, which are exactly the colours a coach reaches for
 * to make a class stand out.
 */
export function prefersWhiteTextOn(hex: string | undefined): boolean | null {
  const rgb = parseColor(hex);
  if (!rgb) return null;
  return relativeLuminance(rgb) <= INK_CROSSOVER_LUMINANCE;
}

function toHex(rgb: Rgb): string {
  return (
    "#" +
    rgb
      .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * `percentOfA`% of `a` over `b`, in gamma-encoded sRGB — the same space and
 * the same arithmetic CSS `color-mix(in srgb, a p%, b)` uses.
 */
export function mixColors(
  a: string | undefined,
  b: string | undefined,
  percentOfA: number
): string | undefined {
  const rgbA = parseColor(a);
  const rgbB = parseColor(b);
  if (!rgbA || !rgbB) return undefined;
  const p = percentOfA / 100;
  return toHex([
    rgbA[0] * p + rgbB[0] * (1 - p),
    rgbA[1] * p + rgbB[1] * (1 - p),
    rgbA[2] * p + rgbB[2] * (1 - p),
  ]);
}

/**
 * `rgba()` form of a colour. The native fill bar needs this because React
 * Native has no `currentColor` and no `color-mix(..., transparent)`.
 */
export function withAlpha(
  color: string | undefined,
  alpha: number
): string | undefined {
  const rgb = parseColor(color);
  if (!rgb) return undefined;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/* ── web emitters (CSS) ────────────────────────────────────────────────── */

/**
 * Ink or white, whichever actually reads on `hex`.
 *
 * Emits CSS custom-property references so the browser resolves them per
 * theme; see `contrastTextOnNative` for the resolved-colour equivalent.
 */
export function contrastTextOn(hex: string | undefined): string {
  const preferWhite = prefersWhiteTextOn(hex);
  if (preferWhite === null) return "hsl(var(--card))";
  return preferWhite ? "#FFFFFF" : "hsl(var(--foreground))";
}

/**
 * A finished class keeps its hue but loses its voice: saturation collapses and
 * lightness lifts, so blue becomes blue-grey. Recognisable, clearly spent.
 *
 * Blends the class colour into the CARD colour rather than toward white. The
 * card is light in the light theme and navy in the dark one, so a finished
 * class recedes in both — an earlier version always lightened, and on dark
 * that made spent classes the brightest thing on the grid.
 */
export function fadeColor(hex: string | undefined): string | undefined {
  if (!parseColor(hex)) return undefined;
  return `color-mix(in srgb, ${hex} ${FADE_MIX_PERCENT}%, hsl(var(--card)))`;
}

/**
 * The class's own colour, pulled far enough toward the foreground to be read
 * as text on the card.
 *
 * The next class is drawn as a white body with its colour as the border, so
 * its label and fill bar should carry that colour too — otherwise the block
 * announces which class it is only at its edge. But the raw hex cannot be used
 * directly: the yellow swatch on white is 1.9:1.
 *
 * Blending toward `--foreground` works in BOTH themes without knowing which is
 * active, because foreground always contrasts with card — it darkens the hue
 * on the light theme and lightens it on the dark one.
 */
export function readableInk(hex: string | undefined): string | undefined {
  if (!parseColor(hex)) return undefined;
  return `color-mix(in srgb, ${hex} ${READABLE_INK_MIX_PERCENT}%, hsl(var(--foreground)))`;
}

/* ── native emitters (resolved colours) ────────────────────────────────── */

/**
 * The surface colours the blends are measured against. On web these are CSS
 * variables the browser resolves; React Native has no such indirection, so the
 * caller passes the resolved values — in practice `lightTheme` / `darkTheme`
 * from `./tokens`, which is what `nativeCalendarColors()` does for you.
 */
export interface CalendarSurfaces {
  /** The surface a block sits ON: `--card`. */
  card: string;
  /** Body ink: `--foreground`. */
  foreground: string;
  /** Recessive ink for spent blocks: `--muted-foreground`. */
  mutedForeground: string;
}

/**
 * The design tokens as calendar surfaces. Mobile is light-only today, but the
 * mode argument means the day it gains a dark theme, the calendar follows
 * without a second set of decisions.
 */
export function nativeCalendarSurfaces(
  mode: "light" | "dark" = "light"
): CalendarSurfaces {
  const t = mode === "dark" ? darkTheme : lightTheme;
  return {
    card: t.card,
    foreground: t.foreground,
    mutedForeground: t.mutedForeground,
  };
}

/** `contrastTextOn`, resolved to a concrete colour for React Native. */
export function contrastTextOnNative(
  hex: string | undefined,
  surfaces: CalendarSurfaces
): string {
  const preferWhite = prefersWhiteTextOn(hex);
  if (preferWhite === null) return surfaces.card;
  return preferWhite ? "#FFFFFF" : surfaces.foreground;
}

/** `fadeColor`, resolved to a concrete colour for React Native. */
export function fadeColorNative(
  hex: string | undefined,
  surfaces: CalendarSurfaces
): string | undefined {
  return mixColors(hex, surfaces.card, FADE_MIX_PERCENT);
}

/** `readableInk`, resolved to a concrete colour for React Native. */
export function readableInkNative(
  hex: string | undefined,
  surfaces: CalendarSurfaces
): string | undefined {
  return mixColors(hex, surfaces.foreground, READABLE_INK_MIX_PERCENT);
}

/* ── state resolution (platform-neutral) ───────────────────────────────── */

/**
 * Local Date for an event's start/end, from its `date` + `HH:mm` strings.
 *
 * NOTE for the native side: `new Date("2026-08-20T10:00")` is an offset-less
 * date-time. Every caller below guards with `Number.isNaN`, so a runtime that
 * refuses to parse it degrades to "no next-class highlight" rather than
 * throwing.
 */
/**
 * Builds the Date from its PARTS rather than parsing "2026-08-20T10:00".
 *
 * An offset-less date-time string is implementation-defined: V8 reads it as
 * local time, but Hermes — which is what ships in the React Native app — can
 * return Invalid Date for the same input. The guards downstream make that fail
 * SOFT: no next-class highlight, no error in the log, nothing to notice. That
 * is the worst kind of bug, so the parse is removed rather than tested for.
 *
 * `new Date(y, m, d, h, min)` is local time on every engine, which is what a
 * class time means — a class at 10:00 is at 10:00 where the club is.
 */
export function localDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return new Date(NaN);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function eventTimes(event: CalendarEvent): { start: Date; end: Date } {
  const start = localDateTime(event.date, event.startTime);
  let end = localDateTime(event.date, event.endTime);
  // A class ending "00:30" started the previous evening — roll to the next day
  // rather than producing a negative-length event.
  if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * The same start/end as UTC-anchored digits, for COMPARISONS (PAD-295): no
 * device zone, no DST gap, and the midnight roll is an exact 24 h.
 */
export function eventTimesMs(event: CalendarEvent): { startMs: number; endMs: number } {
  const startMs = wallClockMs(event.date, event.startTime);
  let endMs = wallClockMs(event.date, event.endTime);
  if (endMs < startMs) endMs += 24 * 60 * 60 * 1000;
  return { startMs, endMs };
}

export function hasOpenSpots(event: CalendarEvent): boolean {
  return (
    event.type === "class" &&
    event.participantCount !== undefined &&
    event.maxPlayers !== undefined &&
    event.maxPlayers > 0 &&
    event.participantCount < event.maxPlayers
  );
}

/**
 * The id of the soonest class that has not finished yet. Computed once over
 * the whole visible set, since a single card cannot know it is the next one.
 * Returns undefined when nothing upcoming is in view.
 */
export function findNextEventId(
  events: CalendarEvent[],
  now: Date = new Date()
): string | undefined {
  // `now` is a real instant; the club's digits come from lisbonNowMs (rule 16).
  const nowMs = lisbonNowMs(now);
  let best: { id: string; start: number } | undefined;
  for (const e of events) {
    if (e.type !== "class") continue;
    if (e.status === "canceled" || e.status === "completed") continue;
    const { startMs, endMs } = eventTimesMs(e);
    if (Number.isNaN(startMs) || endMs < nowMs) continue;
    if (!best || startMs < best.start) {
      best = { id: e.id, start: startMs };
    }
  }
  return best?.id;
}

export function resolveEventState(
  event: CalendarEvent,
  { now = new Date(), isNext = false }: { now?: Date; isNext?: boolean } = {}
): EventVisualState {
  if (event.type === "block") return "block";
  if (event.status === "canceled") return "canceled";

  // `now` is a real instant; compared as club digits (rule 16, PAD-295).
  const { endMs } = eventTimesMs(event);
  if (event.status === "completed" || (!Number.isNaN(endMs) && endMs < lisbonNowMs(now))) {
    return "past";
  }
  return isNext ? "next" : "future";
}
