/**
 * PAD-437 (B-201): the Mês grid is seven columns wide, whatever the screen width.
 *
 * The cells used to wrap in one flex-wrap row at width `${100 / 7}%`, and Yoga's rounding could
 * push the seventh (Sunday) onto the next line: every date after it then sat a weekday off. Layout
 * does not run under react-test-renderer, so this pins the structure that makes a wrap
 * impossible: one row per week, seven cells each, no flex-wrap, no percentage widths.
 * The on-device check is Maestro flow 117.
 */
import { addDays, format, startOfMonth, startOfWeek, endOfMonth, endOfWeek } from "date-fns";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";
import { MonthGrid, monthWeeks } from "./MonthGrid";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("@/lib/date-locale", () => ({ useDateLocale: () => undefined }));

function octoberDays(): { days: Date[]; monthStart: Date } {
  const monthStart = startOfMonth(new Date(2026, 9, 15));
  const first = startOfWeek(monthStart, { weekStartsOn: 1 });
  const last = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  return { days, monthStart };
}

describe("MonthGrid (PAD-437)", () => {
  it("renders one row per week, seven cells each, Sunday last", async () => {
    const { days, monthStart } = octoberDays();
    const n = await renderNative(
      <MonthGrid monthDays={days} monthStart={monthStart} selectedDay={monthStart} onSelectDay={vi.fn()} eventsByDay={{}} />,
    );
    const weeks = n.root.root.findAll((i) => i.props.testID === "calendar-month-week" && typeof i.type === "string");
    expect(weeks).toHaveLength(5);
    for (const week of weeks) {
      const cells = week.findAll((i) => String(i.props.testID ?? "").startsWith("calendar-month-cell-") && typeof i.type === "string");
      expect(cells).toHaveLength(7);
    }
    const firstRow = weeks[0].findAll((i) => String(i.props.testID ?? "").startsWith("calendar-month-cell-") && typeof i.type === "string");
    expect(firstRow.map((c) => c.props.testID.slice(-10))).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
  });

  it("has no flex-wrap and no percentage width anywhere in the grid", async () => {
    const { days, monthStart } = octoberDays();
    const n = await renderNative(
      <MonthGrid monthDays={days} monthStart={monthStart} selectedDay={monthStart} onSelectDay={vi.fn()} eventsByDay={{}} />,
    );
    const offenders = n.root.root.findAll((i) => {
      const cls = String(i.props.className ?? "");
      const w = (i.props.style as { width?: unknown } | undefined)?.width;
      return /\bflex-wrap\b/.test(cls) || (typeof w === "string" && w.endsWith("%"));
    });
    expect(offenders.map((o) => `${o.props.className ?? ""} ${JSON.stringify(o.props.style ?? {})}`)).toEqual([]);
  });

  it("monthWeeks splits whole weeks of seven", () => {
    const { days } = octoberDays();
    expect(monthWeeks(days).map((w) => w.length)).toEqual([7, 7, 7, 7, 7]);
    expect(format(monthWeeks(days)[1][6], "yyyy-MM-dd")).toBe("2026-10-11");
  });
});
