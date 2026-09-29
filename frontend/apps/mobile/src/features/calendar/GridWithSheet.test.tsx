/**
 * PAD-436 — calendar.mobile-views rule 17, iOS: in Mês the selected day is shown once, by the
 * sheet; no single-day time grid under the month grid. Semana keeps its week grid. Layout does not
 * run under react-test-renderer, so where the sheet rests is pinned by `sheetTopBounds` in
 * @levelup/config; this pins what renders.
 */
import * as React from "react";
import { View } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";
import { GridWithSheet } from "./GridWithSheet";

vi.mock("./DaySheet", () => ({ DaySheet: () => null }));
vi.mock("@/lib/android-back", () => ({ useAndroidBack: () => undefined }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }) }));

const day = new Date(2026, 9, 29);
const props = {
  days: [day],
  selectedDay: day,
  onSelectDay: vi.fn(),
  eventsByDay: {},
  rangeEvents: [],
  levelCodeById: new Map<string, string>(),
};

describe("GridWithSheet, iOS (PAD-436)", () => {
  it("renders no time grid under a block above (Mês)", async () => {
    const n = await renderNative(<GridWithSheet {...props} above={<View testID="month-grid-stub" />} />);
    expect(n.byTestId("month-grid-stub")).toBeTruthy();
    expect(n.queryByTestId("calendar-time-grid")).toBeNull();
    expect(n.byTestId("calendar-month-sheet-space")).toBeTruthy();
  });

  it("keeps the time grid when nothing is above it (Semana)", async () => {
    const n = await renderNative(<GridWithSheet {...props} />);
    expect(n.byTestId("calendar-time-grid")).toBeTruthy();
  });
});
