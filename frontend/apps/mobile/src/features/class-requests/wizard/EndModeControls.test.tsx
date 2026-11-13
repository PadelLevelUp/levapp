/**
 * PAD-926 (classes.class-requests rule 14a), the phone's half: the weekly request's end is a
 * segmented control with one field at a time, the end date or a class-count stepper (min 1, max
 * MAX_REQUEST_CLASSES). Located by test id, never by copy (`t` returns the key).
 */
import { describe, expect, it, vi } from "vitest";
import { MAX_REQUEST_CLASSES } from "@levelup/config";
import { View } from "react-native";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/date-picker-input", () => ({
  DatePickerInput: ({ testID }: { testID: string }) => <View testID={testID} />,
}));

import * as React from "react";
import { EndModeControls, type EndMode } from "./EndModeControls";

function Harness({ initialMode, initialCount, spy }: { initialMode: EndMode; initialCount: number; spy: (c: number) => void }) {
  const [mode, setMode] = React.useState<EndMode>(initialMode);
  const [count, setCount] = React.useState(initialCount);
  spy(count);
  return (
    <EndModeControls
      endMode={mode}
      onModeChange={setMode}
      endDate="2026-11-10"
      onEndDateChange={() => undefined}
      endCount={count}
      onEndCountChange={setCount}
    />
  );
}

describe("EndModeControls", () => {
  it("[CLASSES-CLASS-REQUESTS-36] shows the date field in date mode and the stepper in count mode", async () => {
    const view = await renderNative(<Harness initialMode="date" initialCount={4} spy={() => undefined} />);
    expect(view.byTestId("wizard-end-date")).toBeTruthy();
    expect(view.queryByTestId("request-end-count")).toBeNull();
    await view.press("request-end-mode-count");
    expect(view.queryByTestId("wizard-end-date")).toBeNull();
    expect(view.byTestId("request-end-count")).toBeTruthy();
  });

  it("[CLASSES-CLASS-REQUESTS-36] the stepper steps by one and stops at 1 and at the largest count", async () => {
    const seen: number[] = [];
    const view = await renderNative(<Harness initialMode="count" initialCount={5} spy={(c) => seen.push(c)} />);
    await view.press("request-end-count-inc");
    await view.press("request-end-count-inc");
    expect(seen[seen.length - 1]).toBe(7);
    for (let i = 0; i < 10; i++) await view.press("request-end-count-dec");
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 0; i < MAX_REQUEST_CLASSES + 5; i++) await view.press("request-end-count-inc");
    expect(seen[seen.length - 1]).toBe(MAX_REQUEST_CLASSES);
  });
});
