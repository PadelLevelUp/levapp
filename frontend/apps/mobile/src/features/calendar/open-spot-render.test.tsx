/**
 * PAD-579 (B-541) — eligibility.open-spot-visibility rule 11, calendar.mobile-views rules 5, 13.
 *
 * A student's open-spot class is an offer: the class colour as a dashed outline on the card
 * surface. The card's ink must then be the readable class colour, never the white that the
 * solid "scheduled" surface resolves to — white on white was the empty card in the ticket's
 * screenshot. The week grid applies the same treatment, so the grid and the panel agree.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { nativeCalendarSurfaces, readableInkNative } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { renderNative } from "@/test/render-native";
import { EventCard } from "./EventCard";
import { TimeGrid } from "./TimeGrid";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));

const SURFACES = nativeCalendarSurfaces("light");
const BLUE = "#1355DC";

const openSpot = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "ClassInstance",
    originalId: 7,
    id: "class-7-2026-10-19",
    type: "class",
    title: "PEAK PERFORMANCE",
    date: "2026-10-19",
    startTime: "09:00",
    endTime: "10:30",
    color: BLUE,
    maxPlayers: 16,
    participantCount: 12,
    openSpot: true,
    ...extra,
  }) as CalendarEvent;

const textColor = (n: ReturnType<typeof renderNative> extends Promise<infer N> ? N : never, text: string) => {
  const hit = n.root.root.findAll(
    (x) => typeof x.type === "string" && Array.isArray(x.props.children) === false && x.props.children === text
  )[0];
  if (!hit) throw new Error(`no text node "${text}"`);
  const style = Array.isArray(hit.props.style) ? Object.assign({}, ...hit.props.style.flat()) : hit.props.style;
  return style?.color;
};

describe("an open-spot card on the day panel (rule 11)", () => {
  it("writes its title, time and chip in the readable class colour, not the solid surface's white", async () => {
    const n = await renderNative(<EventCard event={openSpot()} onPress={() => undefined} />);
    const ink = readableInkNative(BLUE, SURFACES);
    expect(ink).not.toBe("#FFFFFF");
    expect(textColor(n, "PEAK PERFORMANCE")).toBe(ink);
    expect(textColor(n, "09:00 – 10:30")).toBe(ink);
    expect(n.byTestId("calendar-open-spot-chip").props.style.color).toBe(ink);
  });
});

describe("an open-spot block on the week grid (rules 11, 13)", () => {
  it("is the dashed outline on the card surface, like the panel card", async () => {
    const day = new Date(2026, 9, 19);
    const n = await renderNative(
      <TimeGrid
        weekDays={[day]}
        selectedDay={day}
        onSelectDay={() => undefined}
        eventsByDay={{ "2026-10-19": [openSpot()] }}
        hourRange={{ startHour: 8, endHour: 12 }}
      />
    );
    const block = n.byTestId("calendar-grid-block-class-7-2026-10-19");
    const style = Array.isArray(block.props.style) ? Object.assign({}, ...block.props.style.flat()) : block.props.style;
    expect(style.backgroundColor).toBe(SURFACES.card);
    expect(style.borderStyle).toBe("dashed");
    expect(style.borderColor).toBe(BLUE);
  });
});
