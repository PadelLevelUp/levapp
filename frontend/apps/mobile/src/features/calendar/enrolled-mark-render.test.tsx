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
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { CalendarEvent } from "@levelup/types";
import { renderNative } from "@/test/render-native";
import { EventCard } from "./EventCard";
import { TimeGrid } from "./TimeGrid";
import { CalendarViewerProvider } from "./viewer-context";

// The class is "upcoming" only while the clock is before it: pin the clock, derive every fixture date from DAY.
const DAY = "2026-10-19";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));

const cls = (extra: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    model: "ClassInstance",
    originalId: 7,
    id: `class-7-${DAY}`,
    type: "class",
    title: "PEAK PERFORMANCE",
    date: DAY,
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

describe("the ✓ sits beside the title, not across the card (PAD-580 QA)", () => {
  it("the mark and the title share one leading group, so justify-between cannot push the title away", async () => {
    const n = await renderNative(student(<EventCard event={cls()} onPress={() => undefined} />));
    const group = n.byTestId("calendar-event-title-group");
    const inGroup = (pred: (x: { props: Record<string, unknown>; type: unknown }) => boolean) =>
      group.findAll((x) => typeof x.type === "string" && pred(x)).length;
    expect(inGroup((x) => x.props.testID === "calendar-enrolled-mark")).toBe(1);
    expect(inGroup((x) => x.props.children === "PEAK PERFORMANCE")).toBe(1);
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
          eventsByDay={{ [DAY]: [cls(), cls({ id: `class-9-${DAY}`, openSpot: true, startTime: "11:00", endTime: "12:00" })] }}
          hourRange={{ startHour: 8, endHour: 13 }}
        />
      )
    );
    const hasMark = (blockId: string) =>
      n.byTestId(blockId).findAll((x) => typeof x.type === "string" && x.props.testID === "calendar-enrolled-mark").length > 0;
    expect(hasMark(`calendar-grid-block-class-7-${DAY}`)).toBe(true);
    expect(hasMark(`calendar-grid-block-class-9-${DAY}`)).toBe(false);
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

// B-543 (calendar.mobile-views rule 13): past two classes at once, one "+N" selects the day.
describe("the iOS grid on a busy hour (B-543)", () => {
  it("three at 18:00: one block and a '+2' that selects the day", async () => {
    const day = new Date(2026, 9, 28);
    const onSelectDay = vi.fn();
    const at6 = (id: string) => cls({ id, title: id, date: "2026-10-28", startTime: "18:00", endTime: "19:00" });
    const n = await renderNative(
      <TimeGrid
        weekDays={[day]}
        selectedDay={new Date(2026, 9, 27)}
        onSelectDay={onSelectDay}
        eventsByDay={{ "2026-10-28": [at6("x1"), at6("x2"), at6("x3")] }}
        hourRange={{ startHour: 17, endHour: 20 }}
      />
    );
    expect(n.queryByTestId("calendar-grid-block-x1")).not.toBeNull();
    expect(n.queryByTestId("calendar-grid-block-x2")).toBeNull();
    await n.press("calendar-overflow");
    expect(onSelectDay).toHaveBeenCalledWith(day);
  });
});

// PAD-611 (calendar.mobile-views rule 5): the student's relations on the iOS card.
describe("the iOS card — a student's relations (PAD-611)", () => {
  it("invited, waiting and 'Não vou' carry their chips and no ✓", async () => {
    for (const [studentRelation, key] of [
      ["invited", "calendar.relation.invited"],
      ["waiting", "calendar.relation.waiting"],
      ["not_coming", "calendar.relation.notComing"],
    ] as const) {
      const n = await renderNative(student(<EventCard event={cls({ studentRelation })} />));
      expect(n.queryByTestId("calendar-enrolled-mark")).toBeNull();
      expect(n.byTestId("calendar-relation-chip").props.children).toBe(key);
    }
  });
});
