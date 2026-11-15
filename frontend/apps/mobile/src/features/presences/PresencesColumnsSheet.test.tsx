/**
 * PAD-837 (attendance.validation rule 17e): the columns sheet explains the two guest columns. iOS
 * has no tooltips, so the help line sits under the column's name. Asserted on the help element and
 * its key (the mock returns the key), never on the wording, which the owner may still change.
 */
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@rn-primitives/portal", () => ({ PortalHost: () => null }));
vi.mock("@/components/ui/checkbox", async () => {
  const { Pressable } = await import("react-native");
  return {
    Checkbox: (p: { onCheckedChange: () => void }) =>
      createElement(Pressable, { role: "checkbox", onPress: p.onCheckedChange }),
  };
});
vi.mock("@/components/ui/dialog", async () => {
  const { Text, View } = await import("react-native");
  const pass = (p: { children?: ReactNode }) => createElement(View, null, p.children);
  return {
    Dialog: pass,
    DialogContent: pass,
    DialogHeader: pass,
    DialogTitle: (p: { children?: ReactNode }) => createElement(Text, null, p.children),
  };
});

import { PresenceColumnsSheet } from "./PresenceReportSheets";
import { DEFAULT_VISIBLE_COLUMNS, PRESENCE_COLUMNS } from "./report-state";

// Named here, not read from HELPED_COLUMNS: an emptied list must fail this test, not pass it.
const GUEST_COLUMNS = ["invitesReceived", "invitesJoined"];

describe("PresenceColumnsSheet (PAD-837)", () => {
  it("[ATTENDANCE-VALIDATION-65] explains the guest columns", async () => {
    const ui = await renderNative(
      <PresenceColumnsSheet
        open
        onOpenChange={() => {}}
        visible={[...DEFAULT_VISIBLE_COLUMNS]}
        onApply={() => {}}
      />
    );

    for (const key of GUEST_COLUMNS) {
      const help = ui.byTestId(`presences-column-help-${key}`);
      expect(help.props.children).toBe(`presences.columnHelp.${key}`);
      // Inside that column's row, so it reads as that column's line.
      const row = ui.byTestId(`presences-column-${key}`);
      expect(row.findAll((n) => n.props.testID === `presences-column-help-${key}`).length).toBeGreaterThan(0);
    }

    const helped = PRESENCE_COLUMNS.map((c) => c.key).filter(
      (key) => ui.root.root.findAll((n) => n.props.testID === `presences-column-help-${key}` && typeof n.type === "string").length > 0
    );
    expect(helped).toEqual(GUEST_COLUMNS);
  });
});
