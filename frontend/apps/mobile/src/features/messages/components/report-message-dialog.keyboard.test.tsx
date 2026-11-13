/**
 * PAD-838 (mobile.android-runtime rule 15): the report dialog's reasons and details scroll, so with
 * the keyboard up on a small iPhone they give way to it and the buttons stay above the keyboard.
 * Before, nothing in its body could shrink: five reasons, the details box and three stacked
 * buttons were taller than the space above the keyboard.
 */
import { createElement, type ReactNode } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@levelup/api", () => ({ messagesApi: { reportMessage: vi.fn() } }));
vi.mock("@/components/ui/textarea", async () => {
  const { TextInput } = await import("react-native");
  return { Textarea: (p: Record<string, unknown>) => createElement(TextInput, p) };
});
vi.mock("@/components/ui/dialog", async () => {
  const { View } = await import("react-native");
  const pass = (p: { children?: ReactNode }) => createElement(View, null, p.children);
  return { Dialog: pass, DialogContent: pass, DialogFooter: pass, DialogHeader: pass, DialogTitle: pass };
});

import { renderNative } from "@/test/render-native";
import { ReportMessageDialog } from "./report-message-dialog";

const inside = (n: ReactTestInstance, testID: string) => {
  for (let p = n.parent; p; p = p.parent) if (p.props.testID === testID) return p;
  return null;
};

describe("ReportMessageDialog: the keyboard", () => {
  it("[MOBILE-ANDROID-RUNTIME-22] the reasons and the details scroll, the buttons do not", async () => {
    const ui = await renderNative(
      <ReportMessageDialog open onOpenChange={() => {}} messageId={1} onReportAndBlock={() => {}} />
    );
    const body = ui.byTestId("report-body");
    expect(body.type).toBe("ScrollView");
    expect(body.props.keyboardShouldPersistTaps).toBe("handled");
    expect(inside(ui.byTestId("report-details-input"), "report-body")).not.toBeNull();
    expect(inside(ui.byTestId("report-reason-spam"), "report-body")).not.toBeNull();
    expect(inside(ui.byTestId("report-and-block"), "report-body")).toBeNull();
  });
});
