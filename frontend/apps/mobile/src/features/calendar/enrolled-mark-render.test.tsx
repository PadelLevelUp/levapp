/**
 * PAD-578 on iOS — calendar.mobile-views rule 19 ("A student's enrolled class is ticked on the
 * card and the grid block"): the ✓ (`calendar-enrolled-mark`, labelled) on a student's enrolled
 * class card and grid block, never on an open spot (chip instead), never for a coach (the
 * default viewer). The label keys resolve in both locale trees (mobile i18n static imports).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import { renderNative } from "@/test/render-native";
import { EventCard } from "./EventCard";
import { TimeGrid } from "./TimeGrid";
import { CalendarViewerProvider } from "./viewer-context";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));

const cls = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "ClassInstance",
    originalId: 7,
    id: "class-7-2026-10-19",
    type: "class",
    title: "PEAK PERFORMANCE",
    date: "2026-10-19",
    startTime: "09:00",
    endTime: "10:30",
    color: "#1355DC",
    maxPlayers: 16,
    participantCount: 12,
    ...extra,
  }) as CalendarEvent;

const student = (el: React.ReactElement) => <CalendarViewerProvider viewer="student">{el}</CalendarViewerProvider>;

describe("the day card (rule 19)", () => {
  it("ticks a student's enrolled class with an accessible label", async () => {
    const n = await renderNative(student(<EventCard event={cls()} onPress={() => undefined} />));
    const mark = n.byTestId("calendar-enrolled-mark");
    expect(mark.props.accessibilityLabel).toBe("calendar.eventCard.enrolled");
  });
  it("no tick on an open spot (chip instead), none for a coach", async () => {
    const open = await renderNative(student(<EventCard event={cls({ openSpot: true })} />));
    expect(open.queryByTestId("calendar-enrolled-mark")).toBeNull();
    expect(open.byTestId("calendar-open-spot-chip")).toBeTruthy();
    const coach = await renderNative(<EventCard event={cls()} />);
    expect(coach.queryByTestId("calendar-enrolled-mark")).toBeNull();
  });
});

describe("the Semana grid block (rule 19)", () => {
  it("ticks the enrolled class's block and not the open spot's", async () => {
    const day = new Date(2026, 9, 19);
    const n = await renderNative(
      student(
        <TimeGrid
          weekDays={[day]}
          selectedDay={day}
          onSelectDay={() => undefined}
          eventsByDay={{ "2026-10-19": [cls(), cls({ id: "class-9-2026-10-19", openSpot: true, startTime: "11:00", endTime: "12:00" })] }}
          hourRange={{ startHour: 8, endHour: 13 }}
        />
      )
    );
    const hasMark = (blockId: string) =>
      n.byTestId(blockId).findAll((x) => typeof x.type === "string" && x.props.testID === "calendar-enrolled-mark").length > 0;
    expect(hasMark("calendar-grid-block-class-7-2026-10-19")).toBe(true);
    expect(hasMark("calendar-grid-block-class-9-2026-10-19")).toBe(false);
  });
});

describe("the label keys resolve on the phone (i18n static imports)", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const LOCALES = path.resolve(HERE, "../../../../../src/locales");
  for (const locale of ["pt", "en"]) {
    it(`${locale}: calendar.eventCard.enrolled and calendar.legend.enrolled`, () => {
      const tree = JSON.parse(fs.readFileSync(path.join(LOCALES, locale, "calendar.json"), "utf8"));
      expect(typeof tree.calendar.eventCard.enrolled).toBe("string");
      expect(typeof tree.calendar.legend.enrolled).toBe("string");
    });
  }
});
