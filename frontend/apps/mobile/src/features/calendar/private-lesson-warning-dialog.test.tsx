/**
 * PAD-929 (classes.join-requests rule 22), the phone's half: the private-lesson warning, not yet
 * placed in any sheet (owner question 2). Located by test id; `t` returns the key.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/alert-dialog", async () => {
  const { Pressable, View } = await import("react-native");
  const box = (p: { children?: React.ReactNode; testID?: string }) => React.createElement(View, { testID: p.testID }, p.children);
  const button = (p: { children?: React.ReactNode; testID?: string; onPress?: () => void }) =>
    React.createElement(Pressable, { testID: p.testID, onPress: p.onPress }, p.children);
  return {
    AlertDialog: (p: { open: boolean; children?: React.ReactNode }) => (p.open ? React.createElement(View, null, p.children) : null),
    AlertDialogContent: box,
    AlertDialogHeader: box,
    AlertDialogFooter: box,
    AlertDialogDescription: box,
    AlertDialogCancel: button,
    AlertDialogAction: button,
  };
});

import { PrivateLessonWarningDialog } from "./private-lesson-warning-dialog";

function textOf(node: ReactTestInstance): string {
  return node.children.map((c) => (typeof c === "string" ? c : textOf(c))).join("");
}

async function mount(open = true) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const ui = await renderNative(<PrivateLessonWarningDialog open={open} onCancel={onCancel} onConfirm={onConfirm} />);
  return { ui, onCancel, onConfirm };
}

describe("PrivateLessonWarningDialog on iOS", () => {
  it("asks the ticket's question with SIM and NÃO", async () => {
    const { ui } = await mount();
    expect(textOf(ui.byTestId("private-lesson-warning-body"))).toBe("calendar.privateLessonWarning.body");
    expect(textOf(ui.byTestId("private-lesson-warning-yes"))).toBe("calendar.privateLessonWarning.yes");
    expect(textOf(ui.byTestId("private-lesson-warning-no"))).toBe("calendar.privateLessonWarning.no");
  });

  it("NÃO cancels and never confirms; SIM confirms", async () => {
    const { ui, onCancel, onConfirm } = await mount();
    await ui.press("private-lesson-warning-no");
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    await ui.press("private-lesson-warning-yes");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows nothing while closed", async () => {
    const { ui } = await mount(false);
    expect(ui.queryByTestId("private-lesson-warning")).toBeNull();
  });
});
