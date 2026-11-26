/**
 * calendar.event-detail rule 28 (UI idea 6): reading a class starts with when it is. The header block is rendered
 * here; the sheet's mount (the block while reading, the five boxes while editing) is pinned by reading its source,
 * as ClassCapacityBar.test.tsx does (the sheet mounts too much for a render test).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("react-i18next", async (orig) => ({
  ...(await orig<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { ClassWhenHeader } from "./ClassWhenHeader";

const series = {
  date: "2026-11-24",
  startTime: "10:30",
  endTime: "12:00",
  until: "calendar.detail.untilDate",
  levelCode: "I2",
  clubName: "Clube Norte",
  courtName: "Campo 3",
};
const capacity = (
  <div data-testid="class-detail-capacity">
    <span className="sr-only">calendar.detail.capacity</span>
    <p>3/8</p>
  </div>
);

describe("the class page's header block", () => {
  it("[CALENDAR-EVENT-DETAIL-43] reading shows the header block and editing the boxes", () => {
    // A series with a level, a club and a court.
    const { unmount } = render(
      <ClassWhenHeader editing={false} {...series}>
        {capacity}
      </ClassWhenHeader>
    );
    const block = screen.getByTestId("class-detail-when");

    // The tile: weekday, the largest day number, month; it reads out as one full date, under the date box's name.
    const tile = within(block).getByTestId("class-detail-date-tile");
    expect(tile).toHaveTextContent("ter");
    expect(tile).toHaveTextContent("24");
    expect(tile).toHaveTextContent("nov");
    expect(within(block).getByRole("img", { name: "terça-feira, 24 de novembro de 2026" })).toBeInTheDocument();
    expect(within(block).getByRole("group", { name: "calendar.detail.date" })).toContainElement(tile);
    expect(tile.className).toContain("w-14"); // 56px
    expect(within(tile).getByText("24").className).toMatch(/text-(3xl|4xl)/);

    // The time range in the display face, on one line, under the time box's name.
    const time = within(block).getByTestId("class-detail-time");
    expect(time).toHaveTextContent("10:30 – 12:00");
    expect(time.className).toContain("font-display");
    expect(time.className).toContain("whitespace-nowrap");
    expect(time.className).toContain("text-[24px]");
    expect(time.className).toContain("text-[26px]");
    expect(within(block).getByRole("group", { name: "calendar.detail.time" })).toContainElement(time);

    // The series' until line under it; then the facts line: the level, the club and court pair.
    expect(within(block).getByTestId("class-detail-until")).toHaveTextContent("calendar.detail.untilDate");
    const facts = within(block).getByTestId("class-detail-facts");
    expect(facts).toHaveTextContent("I2");
    expect(facts).toHaveTextContent("·");
    const place = within(facts).getByTestId("class-detail-place");
    expect(place).toHaveTextContent("Clube Norte · Campo 3");
    // The labels the boxes showed stay as the accessible names of the values (read out, not drawn).
    expect(within(facts).getByTestId("class-detail-level")).toHaveTextContent("calendar.detail.level");
    expect(place).toHaveTextContent("calendar.detail.club");
    expect(within(facts).getByText(/calendar\.detail\.level/).className).toContain("sr-only");

    // The capacity line is the last thing in the block, with its id.
    expect(block.lastElementChild).toBe(within(block).getByTestId("class-detail-capacity"));
    unmount();

    // A one-off class with neither level, club nor court: no until line, and no facts line (nothing left out as a dash).
    render(
      <ClassWhenHeader editing={false} date="2026-11-24" startTime="10:30" endTime="12:00">
        {capacity}
      </ClassWhenHeader>
    );
    const bare = screen.getByTestId("class-detail-when");
    expect(within(bare).queryByTestId("class-detail-until")).toBeNull();
    expect(within(bare).queryByTestId("class-detail-facts")).toBeNull();
    expect(within(bare).queryByTestId("class-detail-place")).toBeNull();
    expect(within(bare).getByTestId("class-detail-time")).toHaveTextContent("10:30 – 12:00");
    expect(within(bare).getByTestId("class-detail-capacity")).toBeInTheDocument();
  });

  it("[CALENDAR-EVENT-DETAIL-43] a student's facts line is the place only; a missing level or court is left out", () => {
    render(
      <ClassWhenHeader editing={false} date="2026-11-24" startTime="10:30" endTime="12:00" clubName="Clube Norte">
        {capacity}
      </ClassWhenHeader>
    );
    const facts = screen.getByTestId("class-detail-facts");
    expect(within(facts).queryByTestId("class-detail-level")).toBeNull();
    expect(screen.getByTestId("class-detail-place")).toHaveTextContent("Clube Norte");
    expect(facts.textContent).not.toContain("—");
    expect(facts.textContent).not.toContain("·");
  });

  it("[CALENDAR-EVENT-DETAIL-43] editing draws no header block: its children are the boxes", () => {
    render(
      <ClassWhenHeader editing {...series}>
        <div data-testid="a-box" />
      </ClassWhenHeader>
    );
    expect(screen.queryByTestId("class-detail-when")).toBeNull();
    expect(screen.queryByTestId("class-detail-date-tile")).toBeNull();
    expect(screen.getByTestId("a-box")).toBeInTheDocument();
  });

  it("[CALENDAR-EVENT-DETAIL-43] the sheet mounts the header while reading and the five boxes only while editing", () => {
    const src = readFileSync(join(__dirname, "ClassDetailSheet.tsx"), "utf8");
    expect(src).toMatch(/<ClassWhenHeader[\s\S]*?editing=\{isEditing\}/);
    // The date and time boxes, and the level and club boxes, are drawn only while editing…
    for (const marker of ["{/* Date */}", "{/* Level */}"]) {
      const at = src.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      expect(src.slice(Math.max(0, at - 80), at), marker).toMatch(/\{isEditing && \(\s*<>\s*$/);
    }
    const afterDate = src.slice(src.indexOf("{/* Date */}"), src.indexOf("{/* Capacity */}"));
    expect(afterDate).toContain("{/* Time */}");
    expect(afterDate).toMatch(/<\/>\s*\)\}\s*$/);
    const afterLevel = src.slice(src.indexOf("{/* Level */}"), src.indexOf("</ClassWhenHeader>"));
    expect(afterLevel).toContain("{/* Club · Court");
    expect(afterLevel).toMatch(/<\/>\s*\)\}\s*$/);
    // …and the capacity box stays one box (its id and its count are the reading line too).
    expect(src.match(/data-testid="class-detail-capacity"/g)?.length).toBe(1);
  });
});
