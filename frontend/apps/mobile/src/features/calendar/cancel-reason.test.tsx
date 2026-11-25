/**
 * PAD-840 (classes.delete rule 12) on iOS: the class screen's delete dialog takes a reason, previews the
 * message the students get and sends both as shown. It is the shared dialog, the one that sits above the
 * keyboard (mobile.android-runtime rule 15).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@levelup/types";

import { renderNative } from "@/test/render-native";

const api = vi.hoisted(() => ({ preview: vi.fn() }));
vi.mock("@levelup/api/src/resources/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  previewClassCancellation: api.preview,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/button", async () => {
  const { Pressable } = await import("react-native");
  return { Button: (p: Record<string, unknown>) => createElement(Pressable, p) };
});
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: (p: Record<string, unknown>) => createElement(Text, p) };
});
vi.mock("@/components/ui/label", async () => {
  const { Text } = await import("react-native");
  return { Label: (p: Record<string, unknown>) => createElement(Text, p) };
});
vi.mock("@/components/ui/textarea", async () => {
  const { TextInput } = await import("react-native");
  return { Textarea: (p: Record<string, unknown>) => createElement(TextInput, p) };
});
vi.mock("@/components/ui/checkbox", async () => {
  const { Pressable } = await import("react-native");
  return {
    Checkbox: (p: { testID?: string; checked: boolean; disabled?: boolean; onCheckedChange: (c: boolean) => void }) =>
      createElement(Pressable, {
        testID: p.testID, role: "checkbox", "aria-checked": p.checked, disabled: p.disabled,
        onPress: () => p.onCheckedChange(!p.checked),
      }),
  };
});
vi.mock("@/components/ui/dialog", async () => {
  const { View } = await import("react-native");
  const pass = (p: { children?: ReactNode }) => createElement(View, null, p.children);
  return {
    Dialog: (p: { open: boolean; children?: ReactNode }) => (p.open ? createElement(View, null, p.children) : null),
    DialogContent: pass, DialogDescription: pass, DialogFooter: pass, DialogHeader: pass, DialogTitle: pass,
  };
});

import { ClassDeleteDialog } from "./class-delete-dialog";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const event = { model: "Lesson", originalId: 7, date: "2099-10-19" } as unknown as CalendarEvent;
const onConfirm = vi.fn();
const textOf = (node: { children: unknown[] }): string =>
  node.children.map((c) => (typeof c === "string" ? c : textOf(c as { children: unknown[] }))).join("");
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 400)));
const open = (isRecurring = true) =>
  renderNative(
    <ClassDeleteDialog
      open onOpenChange={() => undefined} event={event} title="Aula" isRecurring={isRecurring}
      attendanceRecorded={false} onConfirm={onConfirm}
    />,
  );

beforeEach(() => {
  onConfirm.mockReset();
  api.preview.mockReset().mockImplementation(async (_event, cancel) => ({
    text: `Olá Ana.${cancel.sendReason ? ` Motivo: ${cancel.reason}.` : ""}`, recipients: 1,
  }));
});

describe("the iOS delete dialog's cancellation reason (PAD-840)", () => {
  it("[CLASSES-DELETE-17] the dialog sends the reason it previews", async () => {
    const ui = await open();
    const box = () => ui.byTestId("cancel-reason-send").props;
    expect(box().disabled).toBe(true);
    expect(box()["aria-checked"]).toBe(false);

    await ui.changeText("cancel-reason-input", " Chuva forte");
    expect(textOf(ui.byTestId("cancel-reason-counter"))).toBe("12/200");
    expect(ui.byTestId("cancel-reason-input").props.maxLength).toBe(200);
    expect(box().disabled).toBe(false);
    expect(box()["aria-checked"]).toBe(true);
    await settle();
    expect(textOf(ui.byTestId("cancel-reason-preview"))).toBe("Olá Ana. Motivo: Chuva forte.");

    await ui.press("class-delete-confirm");
    expect(onConfirm).toHaveBeenLastCalledWith("single", { reason: "Chuva forte", sendReason: true });

    await ui.press("cancel-reason-send");
    await settle();
    expect(textOf(ui.byTestId("cancel-reason-preview"))).toBe("Olá Ana.");
    await ui.press("class-delete-confirm-future");
    expect(onConfirm).toHaveBeenLastCalledWith("future", { reason: "Chuva forte", sendReason: false });
  });

  it("[CLASSES-DELETE-17] a one-off without a reason sends neither field, and an empty class tells nobody", async () => {
    api.preview.mockResolvedValue({ text: "Olá Aluno.", recipients: 0 });
    const ui = await open(false);
    await settle();
    expect(ui.byTestId("cancel-reason-nobody")).toBeTruthy();
    expect(ui.queryByTestId("cancel-reason-preview")).toBeNull();
    expect(ui.queryByTestId("cancel-reason-send")).toBeNull();
    expect(ui.queryByTestId("class-delete-confirm-future")).toBeNull();
    await ui.press("class-delete-confirm");
    expect(onConfirm).toHaveBeenCalledWith("single", undefined);
  });

  it("[CLASSES-DELETE-17] the class screen uses it, and it is the shared dialog", () => {
    const screen = fs.readFileSync(path.resolve(HERE, "../../..", "app/class/[id].tsx"), "utf8");
    expect(screen).toMatch(/<ClassDeleteDialog[\s\S]{0,300}onConfirm=\{handleDelete\}/);
    expect(screen).toMatch(/removeClass\.mutateAsync\(\{ event, scope, cancel \}\)/);
    const dialog = fs.readFileSync(path.resolve(HERE, "class-delete-dialog.tsx"), "utf8");
    expect(dialog).toMatch(/from "@\/components\/ui\/dialog"/);
    expect(dialog).toMatch(/<ScrollView style=\{\{ flexShrink: 1 \}\} keyboardShouldPersistTaps="handled">/);
  });
});

describe("the iOS delete dialog's editable cancellation message (PAD-840, phase 2)", () => {
  const TEMPLATE = "Olá {name}, aula às {time}. Motivo: {reason}.";

  beforeEach(() => {
    api.preview.mockReset().mockImplementation(async (_event, cancel) => ({
      text: cancel.messageOverride ? `[${cancel.messageOverride}]` : "Olá Ana.", recipients: 1, template: TEMPLATE,
    }));
  });

  it("[CLASSES-DELETE-18] shows the template as chips and sends nothing extra while it is untouched", async () => {
    const ui = await open(false);
    await settle();
    expect(ui.byTestId("cancel-message-editor")).toBeTruthy();
    for (const name of ["name", "time", "reason"]) expect(ui.byTestId(`cancel-message-token-${name}`)).toBeTruthy();
    expect(ui.byTestId("cancel-message-text-0").props.value).toBe("Olá ");
    expect(ui.byTestId("cancel-message-restore").props.disabled).toBe(true);
    await ui.press("class-delete-confirm");
    expect(onConfirm).toHaveBeenCalledWith("single", undefined);
  });

  it("[CLASSES-DELETE-18] sends the edited text, removes a placeholder whole, and restores the original", async () => {
    const ui = await open(false);
    await settle();
    await ui.changeText("cancel-message-text-0", "Oi ");
    await settle();
    expect(api.preview).toHaveBeenLastCalledWith(
      event, expect.objectContaining({ messageOverride: "Oi {name}, aula às {time}. Motivo: {reason}." }),
    );
    expect(textOf(ui.byTestId("cancel-reason-preview"))).toContain("[Oi {name}");

    await ui.press("cancel-message-token-remove-time");
    expect(ui.queryByTestId("cancel-message-token-time")).toBeNull();
    expect(ui.byTestId("cancel-message-text-2").props.value).toBe(", aula às . Motivo: ");
    await ui.press("class-delete-confirm");
    expect(onConfirm).toHaveBeenLastCalledWith("single", { messageOverride: "Oi {name}, aula às . Motivo: {reason}." });

    await ui.press("cancel-message-restore");
    expect(ui.byTestId("cancel-message-token-time")).toBeTruthy();
    expect(ui.byTestId("cancel-message-text-0").props.value).toBe("Olá ");
    await ui.press("class-delete-confirm");
    expect(onConfirm).toHaveBeenLastCalledWith("single", undefined);
  });

  it("[CLASSES-DELETE-18] an old server sends no template, so there is no editor", async () => {
    api.preview.mockReset().mockResolvedValue({ text: "Olá Ana.", recipients: 1 });
    const ui = await open(false);
    await settle();
    expect(ui.queryByTestId("cancel-message-editor")).toBeNull();
    expect(textOf(ui.byTestId("cancel-reason-preview"))).toBe("Olá Ana.");
  });

  it("[CLASSES-DELETE-18] an emptied editor sends no override, typing beside a chip leaves it, and Repor is the way back", async () => {
    const ui = await open(false);
    await settle();
    await ui.changeText("cancel-message-text-2", ", e depois, aula às ");
    await ui.press("class-delete-confirm");
    expect(onConfirm).toHaveBeenLastCalledWith("single", {
      messageOverride: "Olá {name}, e depois, aula às {time}. Motivo: {reason}.",
    });
    for (const name of ["name", "time", "reason"]) await ui.press(`cancel-message-token-remove-${name}`);
    await ui.changeText("cancel-message-text-0", "");
    expect(ui.queryByTestId("cancel-message-token-name")).toBeNull(); // no snap-back
    await ui.press("class-delete-confirm");
    expect(onConfirm).toHaveBeenLastCalledWith("single", undefined);
    await ui.press("cancel-message-restore");
    expect(ui.byTestId("cancel-message-token-name")).toBeTruthy();
  });

  it("[CLASSES-DELETE-18] a repeated placeholder has its own test id, and over the limit the confirm is off until it fits", async () => {
    api.preview.mockResolvedValue({ text: "x", recipients: 1, template: `{name} e {name} ${"a".repeat(1100)}` });
    const ui = await open(false);
    await settle();
    expect(ui.byTestId("cancel-message-token-name-2")).toBeTruthy();
    expect(ui.byTestId("class-delete-confirm").props.disabled).toBeFalsy(); // untouched: the template as saved
    await ui.press("cancel-message-token-remove-name-2"); // shorter: allowed
    expect(ui.byTestId("class-delete-confirm").props.disabled).toBe(true);
    expect(textOf(ui.byTestId("cancel-message-counter"))).toMatch(/^1\d{3}\/1000$/);
    await ui.changeText("cancel-message-text-0", "b".repeat(1200)); // longer while over: ignored
    expect(ui.byTestId("cancel-message-text-0").props.value.length).toBeLessThan(1200);
  });
});
