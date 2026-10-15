/**
 * PAD-675 — "Couldn't find a navigation context" on the student's "Só as minhas aulas" switch (iOS,
 * debug build). css-interop prints an "upgrade warning" when a component STARTS setting CSS
 * variables after its first render, and printing it crashed on the props it stringifies. Tailwind's
 * `shadow-*` sets `--tw-shadow` variables, and `EventCard` added `shadow-md` only while the card is
 * the next class — which the filter can change for a card that is already mounted (the next class is
 * computed from the filtered list). So the card's className must not depend on being next: the
 * shadow lives in `style` (memory native-modal-sheet-traps-ios: selection in style, never a
 * className swap).
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import { renderNative } from "@/test/render-native";
import { EventCard } from "./EventCard";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));

const event: CalendarEvent = {
  model: "LessonInstance",
  originalId: 9,
  id: "class-9",
  type: "class",
  title: "E2E 664 Enrolled iOS",
  date: "2099-10-16",
  startTime: "08:00",
  endTime: "09:00",
  color: "#1355DC",
  maxPlayers: 4,
  participantCount: 1,
  studentRelation: "enrolled",
} as CalendarEvent;

async function card(isNext: boolean) {
  const n = await renderNative(<EventCard event={event} isNext={isNext} onPress={() => {}} />);
  return n.byTestId(`calendar-event-${event.id}`);
}

const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {});

describe("the next class's card keeps one className (PAD-675)", () => {
  it("does not swap classes when it becomes the next class", async () => {
    const before = await card(false);
    const after = await card(true);
    expect(after.props.className).toBe(before.props.className);
    expect(String(after.props.className)).not.toMatch(/\bshadow/);
  });

  it("carries the next class's shadow inline instead", async () => {
    const next = flat((await card(true)).props.style);
    const other = flat((await card(false)).props.style);
    expect(Number(next.shadowOpacity)).toBeGreaterThan(0);
    expect(next.elevation).toBeGreaterThan(0);
    expect(other.shadowOpacity ?? 0).toBe(0);
  });
});
