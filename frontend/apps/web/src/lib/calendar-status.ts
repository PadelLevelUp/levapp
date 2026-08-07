import type { CalendarEvent } from "@/types";

/**
 * Calendar colour is USER DATA — the coach picks a hex per class from a swatch
 * palette — so it identifies a class, it does not report its state. That left
 * a full class, an empty one and a finished one looking identical.
 *
 * This module keeps the coach's colour as identity and lets *style* carry the
 * state: fill, fade, border and text contrast. Because the hex is arbitrary,
 * nothing here may assume white text reads on it — contrast is computed.
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

/* ── colour maths ──────────────────────────────────────────────────────── */

function parseHex(hex: string): [number, number, number] | null {
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

/** WCAG relative luminance. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Ink or white, whichever actually reads on `hex`.
 *
 * The old code hardcoded white on every class block. That is fine on the navy
 * and red swatches and poor on the yellow and lime ones, which are exactly the
 * colours a coach reaches for to make a class stand out.
 */
export function contrastTextOn(hex: string | undefined): string {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return "hsl(var(--card))";
  // The crossover where ink and white give EQUAL contrast:
  //   white: 1.05 / (L + 0.05)        ink: (L + 0.05) / (L_ink + 0.05)
  // solving gives L = sqrt(1.05 * (L_ink + 0.05)) - 0.05.
  //
  // The familiar 0.179 assumes pure black. Our ink is #101E33 (L = 0.0128),
  // which moves the crossover to 0.2067 — and that difference decides the
  // indigo and violet swatches, where white genuinely wins.
  //
  // Checked against all 8 swatches a coach can pick: worst case 4.23:1.
  return luminance(rgb) > 0.2067 ? "hsl(var(--foreground))" : "#FFFFFF";
}

/**
 * A finished class keeps its hue but loses its voice: saturation collapses and
 * lightness lifts, so blue becomes blue-grey. Recognisable, clearly spent.
 */
export function fadeColor(hex: string | undefined): string | undefined {
  if (!hex || !parseHex(hex)) return undefined;
  // Blend the class colour into the CARD colour rather than toward white.
  // The card is light in the light theme and navy in the dark one, so a
  // finished class recedes in both — an earlier version always lightened, and
  // on dark that made spent classes the brightest thing on the grid.
  //
  // Keeping ~22% of the original means the hue survives (blue still reads as
  // blue-grey) while the chroma drops away.
  return `color-mix(in srgb, ${hex} 22%, hsl(var(--card)))`;
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
 *
 * 55% is the most colour that can be kept while clearing 4.5:1 across all
 * eight swatches in both themes; the binding case is yellow at 4.79 on light.
 */
export function readableInk(hex: string | undefined): string | undefined {
  if (!hex || !parseHex(hex)) return undefined;
  return `color-mix(in srgb, ${hex} 55%, hsl(var(--foreground)))`;
}

/* ── state resolution ──────────────────────────────────────────────────── */

/** Local Date for an event's start/end, from its `date` + `HH:mm` strings. */
export function eventTimes(event: CalendarEvent): { start: Date; end: Date } {
  const start = new Date(`${event.date}T${event.startTime}`);
  let end = new Date(`${event.date}T${event.endTime}`);
  // A class ending "00:30" started the previous evening — roll to the next day
  // rather than producing a negative-length event.
  if (end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
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
  let best: { id: string; start: number } | undefined;
  for (const e of events) {
    if (e.type !== "class") continue;
    if (e.status === "canceled" || e.status === "completed") continue;
    const { start, end } = eventTimes(e);
    if (Number.isNaN(start.getTime()) || end < now) continue;
    if (!best || start.getTime() < best.start) {
      best = { id: e.id, start: start.getTime() };
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

  const { end } = eventTimes(event);
  if (event.status === "completed" || (!Number.isNaN(end.getTime()) && end < now)) {
    return "past";
  }
  return isNext ? "next" : "future";
}
