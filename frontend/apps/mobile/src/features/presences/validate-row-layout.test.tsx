/**
 * PAD-924 (attendance.validation rule 29): at phone width the validated row squeezed the class name
 * to one letter ("E…"), because the title shared one line with the day, the time range and the
 * present count. Each row, and the drill-in's heading, now gives the title a line of its own and puts
 * the day, time and count on the line under it.
 *
 * Node renders no pixels, so this pins the structure that makes the width available: the title is
 * whole in its node, and it does not share a row with the when-text.
 */
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type { PendingValidationClass } from "@levelup/types";

import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && typeof opts.count === "number" ? `${key}:${opts.count}` : key,
    i18n: { language: "en" },
  }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("@rn-primitives/portal", () => ({ PortalHost: () => null }));
vi.mock("@levelup/hooks", () => ({
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
}));
vi.mock("@/components/ui/input", async () => {
  const { TextInput } = await import("react-native");
  return { Input: (p: Record<string, unknown>) => createElement(TextInput, p) };
});
vi.mock("@/components/ui/checkbox", async () => {
  const { Pressable } = await import("react-native");
  return {
    Checkbox: (p: { checked: boolean; onCheckedChange: () => void; testID?: string }) =>
      createElement(Pressable, { role: "checkbox", testID: p.testID, onPress: p.onCheckedChange }),
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
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ValidateClassesSheet } from "./ValidateClassesSheet";

const TITLE = "Escola de Padel Avançado Terças e Quintas"; // 40 characters

const validated: PendingValidationClass = {
  lessonInstanceId: 7,
  calendarEventId: "lessoninstance-7",
  title: TITLE,
  type: "academy",
  color: null,
  startDatetime: "2026-11-08T06:00:00",
  endDatetime: "2026-11-08T06:30:00",
  date: "2026-11-08",
  unanswered: 0,
  ready: true,
  players: [
    {
      presenceId: 70,
      playerId: 70,
      name: "Rui",
      response: "confirmed",
      status: "present",
      justification: null,
      validated: true,
      lateCancellation: false,
    },
  ],
} as unknown as PendingValidationClass;

/** The host Text whose content is exactly `text`. */
function textNode(root: ReactTestInstance, text: string): ReactTestInstance {
  const [hit] = root.findAll((n) => (n.type as unknown) === "Text" && n.props.children === text);
  if (!hit) throw new Error(`no Text holding "${text}"`);
  return hit;
}

/** The nearest host View above a node: the row it is laid out in. */
function hostRow(node: ReactTestInstance): ReactTestInstance {
  let at = node.parent;
  while (at && !((at.type as unknown) === "View")) at = at.parent;
  if (!at) throw new Error("no host View above the node");
  return at;
}

async function mount() {
  return renderNative(
    <ValidateClassesSheet
      open
      onOpenChange={() => {}}
      pending={[]}
      validated={[validated]}
      weekOffset={-1}
      onWeekChange={() => {}}
      roster={[]}
      onValidate={vi.fn(async () => {})}
      onUnvalidate={vi.fn(async () => {})}
      busy={false}
    />
  );
}

describe("validate rows at phone width (PAD-924)", () => {
  it("[ATTENDANCE-VALIDATION-53] a validated row keeps the whole title on its own line, the day and time under it", async () => {
    const ui = await mount();
    const block = ui.byTestId("presences-validated-row-text");

    const title = textNode(block, TITLE);
    expect(title.props.numberOfLines).toBe(1);
    const when = block.findAll((n) => n.props.testID === "presences-class-when" && typeof n.type === "string")[0];
    expect(when).toBeDefined();
    expect(block.findAll((n) => n.props.testID === "presences-class-present-count" && typeof n.type === "string")).toHaveLength(1);

    // The title is not laid out beside the when-text: they sit in different rows of the block.
    // (Booleans, not the nodes: a failing diff of two render trees prints the whole tree.)
    expect(hostRow(title) === block, "the title sits directly in the block").toBe(true);
    expect(hostRow(when) === block, "the when-text has a row of its own").toBe(false);
    expect(hostRow(hostRow(when)) === block, "that row is the block's second line").toBe(true);
  });

  it("[ATTENDANCE-VALIDATION-53] the drill-in's heading does the same", async () => {
    const ui = await mount();
    await ui.press("presences-edit-7");
    const heading = ui.byTestId("presences-detail-heading");

    const title = textNode(heading, TITLE);
    const when = heading.findAll((n) => n.props.testID === "presences-class-when" && typeof n.type === "string")[0];
    expect(when).toBeDefined();
    expect(hostRow(title) === heading, "the title sits directly in the heading").toBe(true);
    expect(hostRow(when) === heading, "the when-text has a row of its own").toBe(false);
  });
});
