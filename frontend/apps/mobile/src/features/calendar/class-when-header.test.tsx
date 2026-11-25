/**
 * calendar.event-detail rule 28 (UI idea 6), iOS: reading a class starts with when it is. The header block is
 * rendered here; the class screen's mount (the block while reading, the boxes while editing, its one repeat line)
 * is pinned by reading its source, as class-capacity-bar.test.tsx does (the screen is too large to render).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { Text } from "@/components/ui/text";
import type { ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { ClassWhenHeader } from "./ClassWhenHeader";

const text = (node: ReactTestInstance): string => node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");
/** The classes the host Text really gets, after the wrapper merged its own. */
const hostClasses = (node: ReactTestInstance): string[] => {
  const hosts = [node, ...node.findAll((x) => typeof x.type === "string")];
  return String(hosts[hosts.length - 1].props.className ?? "").split(/\s+/);
};
const base = { date: "2026-11-24", startTime: "10:30", endTime: "12:00" };

describe("the class screen's header block (iOS)", () => {
  it("[CALENDAR-EVENT-DETAIL-44] reading shows the header block and editing the boxes", async () => {
    // A class with a level, a club and a court; its capacity line is the screen's own.
    const n = await renderNative(
      <ClassWhenHeader editing={false} {...base} levelCode="I2" clubName="Clube Norte" courtName="Campo 3">
        <Text testID="class-detail-capacity">3/8</Text>
      </ClassWhenHeader>
    );
    const block = n.byTestId("class-detail-when");

    // The tile reads out as one full date and says weekday, day and month.
    const tile = n.byTestId("class-detail-date-tile");
    // The tile is one element named by the date box's label, its value the full spoken date.
    expect(tile.props.accessible).toBe(true);
    expect(tile.props.accessibilityLabel).toBe("calendar.detail.date");
    expect(tile.props.accessibilityValue).toEqual({ text: "terça-feira, 24 de novembro de 2026" });
    expect(text(tile)).toContain("ter");
    expect(text(tile)).toContain("24");
    expect(text(tile)).toContain("nov");
    // The time on one line, shrinking to its line at larger text sizes, in the display face.
    const time = n.byTestId("class-detail-time");
    expect(text(time)).toBe("10:30 – 12:00");
    expect(time.props.numberOfLines).toBe(1);
    expect(time.props.adjustsFontSizeToFit).toBe(true);
    expect(String(time.props.className)).toContain("font-display");
    // The size is a class, so it replaces the wrapper's text-base and its 24px line: an inline 26px kept that line
    // and the simulator cut the digits in half (2026-11-25).
    expect(hostClasses(time)).toContain("text-[26px]");
    expect(hostClasses(time)).not.toContain("text-base");
    expect(time.props.style?.fontSize).toBeUndefined();
    // The level and the place keep the facts line's own size, not the wrapper's 16px.
    for (const id of ["class-detail-level", "class-detail-place"]) {
      expect(hostClasses(n.byTestId(id)), id).toContain("text-sm");
      expect(hostClasses(n.byTestId(id)), id).not.toContain("text-base");
    }
    // The facts line: the level, then the club and court; the labels the boxes had are the values' names.
    const facts = n.byTestId("class-detail-facts");
    expect(text(facts)).toContain("I2");
    expect(text(facts)).toContain("·");
    expect(text(n.byTestId("class-detail-place"))).toBe("Clube Norte · Campo 3");
    // A Text nested in a Text is not an element on iOS: the OUTER facts line is the accessible element and says the
    // labels with the values, in the words the boxes had ("Nível I2, Clube ...").
    expect(facts.props.accessible).toBe(true);
    expect(facts.props.accessibilityLabel).toBe("calendar.detail.level I2, calendar.detail.club Clube Norte · Campo 3");
    expect(n.byTestId("class-detail-level").props.accessibilityLabel).toBeUndefined();
    expect(n.byTestId("class-detail-place").props.accessibilityLabel).toBeUndefined();
    expect(n.byTestId("class-detail-time").props.accessibilityLabel).toBe("calendar.detail.time");
    expect(n.byTestId("class-detail-time").props.accessibilityValue).toEqual({ text: "10:30 – 12:00" });
    expect(n.queryByTestId("class-detail-until")).toBeNull(); // the series' end is the screen's one repeat line
    // The capacity line is the block's last child.
    expect(block.findAll((x) => x.props?.testID === "class-detail-capacity" && typeof x.type === "string")).toHaveLength(1);

    // A one-off class with neither level, club nor court: no facts line.
    const bare = await renderNative(
      <ClassWhenHeader editing={false} {...base}>
        <Text testID="class-detail-capacity">—</Text>
      </ClassWhenHeader>
    );
    expect(bare.queryByTestId("class-detail-facts")).toBeNull();
    expect(bare.queryByTestId("class-detail-place")).toBeNull();
    expect(text(bare.byTestId("class-detail-capacity"))).toBe("—");

    // Editing: no block, the children are the boxes.
    const editing = await renderNative(
      <ClassWhenHeader editing {...base} levelCode="I2">
        <Text testID="a-box">box</Text>
      </ClassWhenHeader>
    );
    expect(editing.queryByTestId("class-detail-when")).toBeNull();
    expect(editing.queryByTestId("class-detail-date-tile")).toBeNull();
    expect(editing.queryByTestId("a-box")).not.toBeNull();
  });

  it("[CALENDAR-EVENT-DETAIL-44] the date tile has no fixed width, keeps each line whole and caps its text scaling", async () => {
    // At the largest accessibility text size a fixed 56pt tile wrapped its text one character per line (simulator,
    // 2026-11-25). Wrapping cannot be seen here; this pins what prevents it: a width that follows the content (a
    // minimum, not a fixed w-14), one line per part, and a cap on how far the tile's text scales.
    const n = await renderNative(
      <ClassWhenHeader editing={false} {...base} levelCode="I2">
        <Text testID="class-detail-capacity">3/8</Text>
      </ClassWhenHeader>
    );
    const tile = n.byTestId("class-detail-date-tile");
    const tileClasses = String(tile.props.className).split(/\s+/);
    expect(tileClasses).not.toContain("w-14");
    expect(tileClasses).toContain("min-w-14");
    expect(tileClasses).toContain("shrink-0");
    const lines = tile.findAll((x) => typeof x.type === "string" && x.props.numberOfLines !== undefined);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.props.numberOfLines).toBe(1);
      expect(line.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.3);
    }
    // No fixed height on the tile or the time's row.
    expect(tileClasses.some((c) => /^h-\d/.test(c))).toBe(false);
  });

  it("[CALENDAR-EVENT-DETAIL-44] a student's facts line is the place only", async () => {
    const n = await renderNative(
      <ClassWhenHeader editing={false} {...base} clubName="Clube Norte">
        <Text testID="class-detail-capacity">3/8</Text>
      </ClassWhenHeader>
    );
    expect(n.queryByTestId("class-detail-level")).toBeNull();
    expect(text(n.byTestId("class-detail-facts"))).not.toContain("·");
    expect(text(n.byTestId("class-detail-facts"))).not.toContain("—");
    expect(n.byTestId("class-detail-facts").props.accessibilityLabel).toBe("calendar.detail.club Clube Norte");
  });

  it("[CALENDAR-EVENT-DETAIL-44] the screen mounts the block while reading, the boxes while editing, and keeps its one repeat line", () => {
    const src = readFileSync(join(__dirname, "../../../app/class/[id].tsx"), "utf8");
    expect(src).toMatch(/<ClassWhenHeader[\s\S]*?editing=\{isEditing\}/);
    // The date, time and level boxes are drawn only while editing; the capacity box (its count, "—" without a capacity) stays.
    const afterHeader = src.slice(src.indexOf("<ClassWhenHeader"), src.indexOf("</ClassWhenHeader>"));
    expect(afterHeader).toMatch(/\{isEditing \? \(\s*<View className="flex-row gap-3">/);
    expect(afterHeader).toContain('testID="class-detail-capacity"');
    expect(afterHeader).toMatch(/maxPlayers \? `\$\{filled\}\/\$\{maxPlayers\}` : "—"/);
    expect(src.match(/testID="class-detail-capacity"/g)?.length).toBe(1);
    // The capacity's name rides on the count Text itself (a hidden row is not read by VoiceOver).
    expect(afterHeader).not.toContain("absolute h-px w-px overflow-hidden opacity-0");
    expect(afterHeader).toMatch(/accessibilityLabel=\{t\("calendar\.detail\.capacity"\)\}[\s\S]{0,160}accessibilityValue=\{\{ text: maxPlayers/);
    // The one repeat line below the block, as today (the series' end is said once, there).
    expect(src).toContain('{isRecurring && !isEditing ? (');
    expect(src).toContain('t("calendar.detail.recurringClassUntil"');
  });
});
