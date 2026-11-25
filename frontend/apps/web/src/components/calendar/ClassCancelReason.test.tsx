/**
 * PAD-840 (classes.delete rule 12): the class sheet's two delete confirmations take a reason, preview the
 * message the students get and send both as shown. Located by test id (R-013).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { CalendarEvent } from "@levelup/types";

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ token: "t", user: { id: 1, roles: ["coach"] } }) }));
vi.mock("@/api/events", () => ({ subscribeAppEvents: () => () => undefined }));
const api = vi.hoisted(() => ({
  getApprovalState: vi.fn(), getClassInstance: vi.fn(), preview: vi.fn(), getClassCancellations: vi.fn(),
}));
vi.mock("@/api/notificationEngine", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getApprovalState: api.getApprovalState,
}));
vi.mock("@/api/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassInstance: api.getClassInstance,
}));
vi.mock("@levelup/api/src/resources/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  previewClassCancellation: api.preview,
  getClassCancellations: api.getClassCancellations,
}));

import { ClassDetailSheet } from "./ClassDetailSheet";

const eventOf = (isRecurring: boolean) =>
  ({
    model: "LessonInstance", originalId: 7, id: "class-7-2099-10-19", type: "class", isRecurring, title: "Class",
    date: "2099-10-19", startTime: "09:00", endTime: "10:30", color: "#1355DC", openSpot: false,
  }) as unknown as CalendarEvent;

const onDelete = vi.fn();
const input = () => screen.getByTestId("cancel-reason-input") as HTMLTextAreaElement;
const box = () => screen.getByTestId("cancel-reason-send");
const ticked = () => box().getAttribute("aria-checked") === "true";
const write = (value: string) => fireEvent.change(input(), { target: { value } });

async function openDelete(event: CalendarEvent) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ClassDetailSheet
          event={event} open onClose={() => undefined} players={[]} levels={[]} canManage
          onDelete={onDelete} onEdit={() => undefined}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("participants-enrolled")).toBeTruthy());
  fireEvent.click(await screen.findByTestId("class-delete"));
  await waitFor(() => expect(input()).toBeTruthy());
}

beforeEach(() => {
  onDelete.mockReset();
  api.getApprovalState.mockReset().mockResolvedValue({ state: "none" });
  api.getClassCancellations.mockReset().mockResolvedValue([]);
  api.getClassInstance.mockReset().mockResolvedValue({
    id: 7, date: "2099-10-19", startTime: "09:00", endTime: "10:30", status: "scheduled",
    presences: [], participants: [{ id: 1, name: "Ana" }], maxPlayers: 4,
  });
  api.preview.mockReset().mockImplementation(async (_event, cancel) => ({
    text: `Olá Ana.${cancel.sendReason ? ` Motivo: ${cancel.reason}.` : ""}`, recipients: 1,
  }));
});
afterEach(() => vi.useRealTimers());

describe("the class sheet's cancellation reason (PAD-840)", () => {
  it.each([["weekly", true], ["one-off", false]])(
    "[CLASSES-DELETE-16] the dialog sends the reason it previews (%s)",
    async (_name, recurring) => {
      const event = eventOf(recurring);
      await openDelete(event);
      expect(box().hasAttribute("disabled")).toBe(true);
      expect(ticked()).toBe(false);

      write(" Chuva forte");
      expect(screen.getByTestId("cancel-reason-counter").textContent).toBe("12/200");
      expect(box().hasAttribute("disabled")).toBe(false);
      expect(ticked()).toBe(true);
      await waitFor(() => expect(screen.getByTestId("cancel-reason-preview").textContent).toBe("Olá Ana. Motivo: Chuva forte."));
      expect(api.preview).toHaveBeenLastCalledWith(event, { reason: "Chuva forte", sendReason: true });

      fireEvent.click(box());
      expect(ticked()).toBe(false);
      write("Chuva forte!");
      expect(ticked()).toBe(false); // the coach's choice stays while they keep writing
      await waitFor(() => expect(screen.getByTestId("cancel-reason-preview").textContent).toBe("Olá Ana."));

      fireEvent.click(screen.getByTestId(recurring ? "class-scope-future" : "class-delete-confirm"));
      expect(onDelete).toHaveBeenCalledWith(event, recurring ? "future" : "single", {
        reason: "Chuva forte!", sendReason: false,
      });
    },
  );

  it("[CLASSES-DELETE-16] stops at 200 characters, and an empty reason sends neither field", async () => {
    await openDelete(eventOf(true));
    write("x".repeat(250));
    expect(input().value).toHaveLength(200);
    expect(input().maxLength).toBe(200);
    expect(screen.getByTestId("cancel-reason-counter").textContent).toBe("200/200");
    write("   ");
    expect(box().hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("class-scope-single"));
    expect(onDelete).toHaveBeenCalledWith(expect.anything(), "single", undefined);
  });

  it("[CLASSES-DELETE-16] nobody enrolled: it says so in place of the preview and the checkbox", async () => {
    api.preview.mockResolvedValue({ text: "Olá Aluno.", recipients: 0 });
    await openDelete(eventOf(true));
    await waitFor(() => expect(screen.getByTestId("cancel-reason-nobody")).toBeTruthy());
    expect(screen.queryByTestId("cancel-reason-preview")).toBeNull();
    expect(screen.queryByTestId("cancel-reason-send")).toBeNull();
  });

  it("[CLASSES-DELETE-16] a preview that fails leaves no preview, and the class can still be cancelled", async () => {
    api.preview.mockRejectedValue(new Error("offline"));
    await openDelete(eventOf(true));
    write("Chuva");
    await waitFor(() => expect(api.preview).toHaveBeenCalled());
    expect(screen.queryByTestId("cancel-reason-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("class-scope-single"));
    expect(onDelete).toHaveBeenCalledWith(expect.anything(), "single", { reason: "Chuva", sendReason: true });
  });

  it("[CLASSES-DELETE-16] asks one preview at a time, and shows the last one", async () => {
    let answer!: (p: { text: string; recipients: number }) => void;
    api.preview.mockReset().mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    api.preview.mockImplementation(async (_e, cancel) => ({ text: cancel.reason, recipients: 1 }));
    await openDelete(eventOf(true));
    write("um");
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));
    write("dois");
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(api.preview).toHaveBeenCalledTimes(1);
    await act(async () => answer({ text: "late", recipients: 1 }));
    await waitFor(() => expect(screen.getByTestId("cancel-reason-preview").textContent).toBe("dois"));
    expect(api.preview).toHaveBeenCalledTimes(2);
  });
});

describe("the class sheet's editable cancellation message (PAD-840, phase 2)", () => {
  const TEMPLATE = "Olá {name}, aula às {time}. Motivo: {reason}.";
  const text = (i: number) => screen.getByTestId(`cancel-message-text-${i}`) as HTMLTextAreaElement;

  beforeEach(() => {
    api.preview.mockReset().mockImplementation(async (_event, cancel) => ({
      text: cancel.messageOverride ? `[${cancel.messageOverride}]` : "Olá Ana.", recipients: 1, template: TEMPLATE,
    }));
  });

  it("[CLASSES-DELETE-18] shows the template with its placeholders as chips, and sends nothing extra untouched", async () => {
    const event = eventOf(false);
    await openDelete(event);
    await waitFor(() => expect(screen.getByTestId("cancel-message-editor")).toBeTruthy());
    for (const name of ["name", "time", "reason"]) expect(screen.getByTestId(`cancel-message-token-${name}`)).toBeTruthy();
    expect(text(0).value).toBe("Olá ");
    expect(text(6).value).toBe(".");
    expect(screen.getByTestId("cancel-message-restore").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("class-delete-confirm"));
    expect(onDelete).toHaveBeenCalledWith(event, "single", undefined);
  });

  it("[CLASSES-DELETE-18] sends the edited text for this cancellation, with no reason written", async () => {
    const event = eventOf(false);
    await openDelete(event);
    await waitFor(() => expect(screen.getByTestId("cancel-message-editor")).toBeTruthy());
    fireEvent.change(text(0), { target: { value: "Oi " } });
    await waitFor(() => expect(api.preview).toHaveBeenLastCalledWith(
      event, expect.objectContaining({ messageOverride: "Oi {name}, aula às {time}. Motivo: {reason}." }),
    ));
    await waitFor(() => expect(screen.getByTestId("cancel-reason-preview").textContent).toContain("[Oi {name}"));
    fireEvent.click(screen.getByTestId("class-delete-confirm"));
    expect(onDelete).toHaveBeenCalledWith(event, "single", {
      messageOverride: "Oi {name}, aula às {time}. Motivo: {reason}.",
    });
  });

  it("[CLASSES-DELETE-18] a placeholder is removed whole and cannot be partly edited", async () => {
    const event = eventOf(false);
    await openDelete(event);
    await waitFor(() => expect(screen.getByTestId("cancel-message-editor")).toBeTruthy());
    // A chip has no text field in it: only its remove control acts on it.
    expect(screen.getByTestId("cancel-message-token-name").querySelector("textarea, input")).toBeNull();
    fireEvent.click(screen.getByTestId("cancel-message-token-remove-time"));
    expect(screen.queryByTestId("cancel-message-token-time")).toBeNull();
    expect(text(2).value).toBe(", aula às . Motivo: ");
    fireEvent.click(screen.getByTestId("class-delete-confirm"));
    expect(onDelete).toHaveBeenCalledWith(event, "single", { messageOverride: "Olá {name}, aula às . Motivo: {reason}." });
  });

  it("[CLASSES-DELETE-18] Repor mensagem original puts the template back", async () => {
    const event = eventOf(false);
    await openDelete(event);
    await waitFor(() => expect(screen.getByTestId("cancel-message-editor")).toBeTruthy());
    fireEvent.click(screen.getByTestId("cancel-message-token-remove-name"));
    expect(screen.getByTestId("cancel-message-restore").hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByTestId("cancel-message-restore"));
    expect(screen.getByTestId("cancel-message-token-name")).toBeTruthy();
    expect(text(0).value).toBe("Olá ");
    fireEvent.click(screen.getByTestId("class-delete-confirm"));
    expect(onDelete).toHaveBeenCalledWith(event, "single", undefined);
  });

  it("[CLASSES-DELETE-18] the editor may be emptied to write a new message; empty sends no override and only Repor puts the text back", async () => {
    const event = eventOf(false);
    await openDelete(event);
    await waitFor(() => expect(screen.getByTestId("cancel-message-editor")).toBeTruthy());
    for (const name of ["name", "time", "reason"]) fireEvent.click(screen.getByTestId(`cancel-message-token-remove-${name}`));
    fireEvent.change(text(0), { target: { value: "" } });
    expect(screen.queryByTestId("cancel-message-token-name")).toBeNull(); // no snap-back
    expect(text(0).value).toBe("");
    await waitFor(() => expect(api.preview).toHaveBeenLastCalledWith(event, expect.not.objectContaining({ messageOverride: expect.anything() })));
    expect(screen.getByTestId("cancel-reason-preview").textContent).toBe("Olá Ana."); // what will go: the template
    fireEvent.change(text(0), { target: { value: "Aula cancelada" } });
    fireEvent.click(screen.getByTestId("class-delete-confirm"));
    expect(onDelete).toHaveBeenCalledWith(event, "single", { messageOverride: "Aula cancelada" });
  });

  it("[CLASSES-DELETE-18] typing beside a placeholder leaves it intact; removing it takes the whole token", async () => {
    const event = eventOf(false);
    await openDelete(event);
    await waitFor(() => expect(screen.getByTestId("cancel-message-editor")).toBeTruthy());
    fireEvent.change(text(2), { target: { value: ", e depois, aula às " } });
    fireEvent.click(screen.getByTestId("class-delete-confirm"));
    expect(onDelete).toHaveBeenLastCalledWith(event, "single", { messageOverride: "Olá {name}, e depois, aula às {time}. Motivo: {reason}." });
  });

  it("[CLASSES-DELETE-18] a placeholder used twice has unique test ids, and fields keep their element when a chip goes", async () => {
    api.preview.mockResolvedValue({ text: "x", recipients: 1, template: "{name} e {name}, {time}" });
    await openDelete(eventOf(false));
    await waitFor(() => expect(screen.getByTestId("cancel-message-editor")).toBeTruthy());
    expect(screen.getByTestId("cancel-message-token-name")).toBeTruthy();
    expect(screen.getByTestId("cancel-message-token-name-2")).toBeTruthy();
    expect(screen.getByTestId("cancel-message-token-remove-name-2")).toBeTruthy();
    const last = text(6); // ", " before {time}... the last text field
    const before = screen.getAllByTestId(/^cancel-message-text-/).length;
    fireEvent.click(screen.getByTestId("cancel-message-token-remove-name"));
    expect(screen.getAllByTestId(/^cancel-message-text-/).length).toBe(before - 1);
    expect(screen.getAllByTestId(/^cancel-message-text-/).at(-1)).toBe(last);
  });

  it("[CLASSES-DELETE-18] a template already over 1000 characters can be shortened, shows the error state and cannot be confirmed until it fits", async () => {
    const long = `{name} ${"a".repeat(1100)}`;
    api.preview.mockResolvedValue({ text: "x", recipients: 1, template: long });
    const event = eventOf(false);
    await openDelete(event);
    await waitFor(() => expect(screen.getByTestId("cancel-message-editor")).toBeTruthy());
    expect(screen.getByTestId("cancel-message-counter").textContent).toBe("1107/1000");
    expect(screen.getByTestId("class-delete-confirm").hasAttribute("disabled")).toBe(false); // untouched: the template, as saved
    fireEvent.click(screen.getByTestId("cancel-message-token-remove-name")); // shorter: allowed
    expect(screen.getByTestId("cancel-message-counter").textContent).toBe("1101/1000");
    expect(screen.getByTestId("class-delete-confirm").hasAttribute("disabled")).toBe(true);
    fireEvent.change(text(0), { target: { value: "b".repeat(1200) } }); // longer while over: ignored
    expect(text(0).value.length).toBe(1101);
    fireEvent.change(text(0), { target: { value: "c".repeat(900) } });
    expect(screen.getByTestId("class-delete-confirm").hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByTestId("class-delete-confirm"));
    expect(onDelete).toHaveBeenCalledWith(event, "single", { messageOverride: "c".repeat(900) });
  });

  it("[CLASSES-DELETE-18] an old server sends no template, so there is no editor and the preview stays read-only", async () => {
    api.preview.mockReset().mockResolvedValue({ text: "Olá Ana.", recipients: 1 });
    await openDelete(eventOf(false));
    await waitFor(() => expect(screen.getByTestId("cancel-reason-preview")).toBeTruthy());
    expect(screen.queryByTestId("cancel-message-editor")).toBeNull();
  });
});
