/**
 * PAD-481 (eligibility.rules rule 6) on iOS: the direction selector under "within N levels" saves
 * the direction AS the operation, keeping N. The rule transitions are unit-tested in
 * eligibility-rules.test.ts; this pins the wiring from the Select to `onChange`. `@/components/ui/select`
 * is a stand-in that keeps the contract the section relies on (value in, onValueChange({value}) out).
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const { Pressable, Text, View } = await import("react-native");
  type Opt = { value: string; label: string };
  const Ctx = React.createContext<{ value?: Opt; onValueChange?: (o: Opt) => void }>({});
  return {
    Select: ({ value, onValueChange, children }: { value?: Opt; onValueChange?: (o: Opt) => void; children: React.ReactNode }) =>
      React.createElement(Ctx.Provider, { value: { value, onValueChange } }, children),
    SelectTrigger: ({ testID, children }: { testID?: string; children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(View, { testID, accessibilityValue: { text: ctx.value?.value } }, children);
    },
    SelectValue: () => React.createElement(Text, null, React.useContext(Ctx).value?.value),
    SelectContent: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    SelectItem: ({ value, label, testID }: Opt & { testID?: string }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(Pressable, { testID, onPress: () => ctx.onValueChange?.({ value, label }) });
    },
  };
});

import { EligibilitySection } from "./eligibility-section";

const rule = (operation: string, value = 2) => ({ attribute: "level", operation, value });

describe("direction of within N levels (PAD-481)", () => {
  it("shows the stored direction, both for a bar set before PAD-481", async () => {
    const n = await renderNative(<EligibilitySection rules={[rule("within_n_of_class")]} onChange={() => {}} />);
    expect(n.byTestId("eligibility-direction").props.accessibilityValue.text).toBe("both");
    expect(n.queryByTestId("eligibility-direction-is-both")).not.toBeNull();
  });

  it.each([
    ["above", "within_n_above_class"],
    ["below", "within_n_below_class"],
  ])("picking %s saves %s with N kept", async (direction, operation) => {
    const onChange = vi.fn();
    const n = await renderNative(<EligibilitySection rules={[rule("within_n_of_class")]} onChange={onChange} />);
    await n.press(`eligibility-direction-${direction}`);
    expect(onChange).toHaveBeenCalledWith([rule(operation)]);
  });

  it("picking both on a one-way bar saves within_n_of_class with N kept", async () => {
    const onChange = vi.fn();
    const n = await renderNative(<EligibilitySection rules={[rule("within_n_below_class", 3)]} onChange={onChange} />);
    expect(n.byTestId("eligibility-direction").props.accessibilityValue.text).toBe("below");
    await n.press("eligibility-direction-both");
    expect(onChange).toHaveBeenCalledWith([rule("within_n_of_class", 3)]);
  });
});
