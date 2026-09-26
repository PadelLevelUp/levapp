/**
 * PAD-463 — classes.create rule 9 on iOS: a recurring class ends on a date, after N classes, or at
 * the season end, one chosen. The payload itself is `recurrenceEndPayload` (@levelup/config, tested
 * there); this pins the iOS choice. testIDs only; `t` returns the key.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => {
  const translation = { t: (key: string) => key, i18n: { language: "en" } };
  return { useTranslation: () => translation };
});
vi.mock("@/components/ui/date-picker-input", async () => {
  const { View } = await import("react-native");
  return { DatePickerInput: (p: { testID?: string }) => React.createElement(View, { testID: p.testID }) };
});

import { RecurrenceEndChoice, type RecurrenceEndChoiceProps } from "./recurrence-end-choice";

function props(over: Partial<RecurrenceEndChoiceProps> = {}): RecurrenceEndChoiceProps {
  return {
    mode: "date", onModeChange: vi.fn(), endDate: "", onEndDateChange: vi.fn(),
    countText: "", onCountTextChange: vi.fn(), lastDate: null, pastSeasonEnd: null, ...over,
  };
}

describe("RecurrenceEndChoice (PAD-463)", () => {
  it("offers the three ways a series ends, the chosen one selected", async () => {
    const n = await renderNative(<RecurrenceEndChoice {...props({ mode: "count" })} />);
    for (const mode of ["date", "count", "season"]) {
      expect(n.byTestId(`class-end-mode-${mode}`).props.accessibilityState.selected).toBe(mode === "count");
    }
  });

  it("choosing a mode says so", async () => {
    const p = props();
    const n = await renderNative(<RecurrenceEndChoice {...p} />);
    await n.press("class-end-mode-season");
    expect(p.onModeChange).toHaveBeenCalledWith("season");
  });

  it("the count shows the last class, and a note when it runs past the season", async () => {
    const n = await renderNative(
      <RecurrenceEndChoice {...props({ mode: "count", countText: "6", lastDate: "2027-08-09", pastSeasonEnd: "2027-07-31" })} />,
    );
    expect(n.byTestId("class-end-count").props.value).toBe("6");
    expect(n.byTestId("class-end-count-last")).toBeTruthy();
    expect(n.byTestId("class-end-count-past-season")).toBeTruthy();
  });

  it("the date picker shows only for an end date; the season shows its hint", async () => {
    const date = await renderNative(<RecurrenceEndChoice {...props({ mode: "date" })} />);
    expect(date.queryByTestId("class-end-date")).not.toBeNull();
    const season = await renderNative(<RecurrenceEndChoice {...props({ mode: "season" })} />);
    expect(season.queryByTestId("class-end-date")).toBeNull();
    expect(season.queryByTestId("class-end-season-hint")).not.toBeNull();
  });
});
