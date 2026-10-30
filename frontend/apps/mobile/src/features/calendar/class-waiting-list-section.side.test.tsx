/**
 * PAD-803 (notifications.waiting-list rule 18a) on iOS: adding a student to a class's waiting list
 * asks the side — the profile side pre-selected and tagged "Habitual"; with no profile side nothing
 * is pre-selected and the add waits for one; the add posts the side chosen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderNative } from "@/test/render-native";

vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/date-picker-input", () => ({ DatePickerInput: () => null }));
vi.mock("@/components/ui/dialog", async () => {
  const { View } = await import("react-native");
  const pass = ({ children }: { children?: unknown }) => children as never;
  return {
    Dialog: ({ open, children }: { open: boolean; children?: unknown }) => (open ? (children as never) : null),
    DialogContent: ({ children }: { children?: unknown }) => children as never,
    DialogHeader: pass,
    DialogTitle: pass,
    DialogFooter: pass,
    DialogView: View,
  };
});
vi.mock("@/features/players/hooks", () => ({
  // Álvaro has a profile side (left); Ana has none.
  useCoachPlayers: () => ({ data: [{ playerId: 1, name: "Álvaro Sousa", side: "left" }, { playerId: 2, name: "Ana Pinto" }] }),
}));
const api = vi.hoisted(() => ({
  addToClassWaitingList: vi.fn(() => Promise.resolve({ action: "added", entryId: 1 })),
  changeClassWaitingListScope: vi.fn(() => Promise.resolve({})),
  removeFromClassWaitingList: vi.fn(),
  checkEligibility: vi.fn(() => Promise.resolve({ ineligible: [] })),
}));
vi.mock("@levelup/api/src/resources/notificationEngine", () => api);
// Real @levelup/hooks since PAD-406: the name resolver reads a roster with no nicknames, so every
// student prints under the real name.
vi.mock("@levelup/api/src/resources/players", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getCoachPlayers: async () => [],
}));

import { ClassWaitingListSection } from "./class-waiting-list-section";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
});

const mount = () =>
  renderNative(
    <QueryClientProvider client={client}>
      <ClassWaitingListSection
        event={{ model: "LessonInstance", originalId: 7, date: "2026-10-20" }}
        isRecurring={false}
        rows={[]}
        enrolledIds={[]}
        onChanged={() => undefined}
      />
    </QueryClientProvider>
  );

async function openAdd() {
  const n = await mount();
  if (!n.queryByTestId("class-waiting-list-add")) await n.press("class-waiting-list-toggle");
  await n.press("class-waiting-list-add");
  await n.flush();
  return n;
}

const checked = (n: Awaited<ReturnType<typeof openAdd>>, id: string) => n.byTestId(id).props.accessibilityState?.checked;

describe("PAD-803 the coach names the side when adding to a class's waiting list (rule 18a)", () => {
  it("pre-selects the profile side, tags it Habitual, and posts the side chosen", async () => {
    api.addToClassWaitingList.mockClear();
    const n = await openAdd();
    expect(n.queryByTestId("class-waiting-list-side")).toBeNull();
    await n.press("class-waiting-list-candidate-1");
    expect(checked(n, "class-waiting-list-side-left")).toBe(true);
    expect(n.queryByTestId("class-waiting-list-side-usual-left")).not.toBeNull();
    expect(n.queryByTestId("class-waiting-list-side-usual-right")).toBeNull();
    await n.press("class-waiting-list-side-both");
    await n.press("class-waiting-list-confirm");
    await n.flush();
    expect(api.addToClassWaitingList).toHaveBeenCalledTimes(1);
    expect((api.addToClassWaitingList.mock.calls[0] as unknown[])[0]).toMatchObject({ playerId: 1, side: "both" });
  });

  it("with no profile side nothing is pre-selected and the add waits for a side", async () => {
    api.addToClassWaitingList.mockClear();
    const n = await openAdd();
    await n.press("class-waiting-list-candidate-2");
    for (const s of ["right", "left", "both"]) expect(checked(n, `class-waiting-list-side-${s}`)).toBe(false);
    await n.press("class-waiting-list-confirm");
    await n.flush();
    expect(api.addToClassWaitingList).not.toHaveBeenCalled();
    await n.press("class-waiting-list-side-right");
    await n.press("class-waiting-list-confirm");
    await n.flush();
    expect((api.addToClassWaitingList.mock.calls[0] as unknown[])[0]).toMatchObject({ playerId: 2, side: "right" });
  });
});
