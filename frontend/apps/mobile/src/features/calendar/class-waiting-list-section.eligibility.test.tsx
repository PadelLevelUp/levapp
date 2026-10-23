/**
 * PAD-724 (PAD-669 R5; notifications.waiting-list rule 18) on iOS: adding a student who fails the
 * class's bar asks first — the warning shows inside the dialog and the button turns into "Adicionar
 * mesmo assim"; a second press adds. A student who passes is added on the first press (the control).
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
  useCoachPlayers: () => ({ data: [{ playerId: 1, name: "Álvaro Sousa" }, { playerId: 2, name: "Ana Pinto" }] }),
}));
const api = vi.hoisted(() => ({
  addToClassWaitingList: vi.fn(() => Promise.resolve({ action: "added", entryId: 1 })),
  changeClassWaitingListScope: vi.fn(() => Promise.resolve({})),
  removeFromClassWaitingList: vi.fn(),
  checkEligibility: vi.fn(() => Promise.resolve({ ineligible: [
    { playerId: 2, name: "Ana Pinto", failures: [{ attribute: "level", operation: "same_as_class", actual: "4", threshold: "5", ladder_distance: -1, reason: null }] },
  ] })),
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

describe("PAD-724 the coach is warned before putting a student who fails the bar on the list", () => {
  it("the first press warns and adds nothing; the second adds", async () => {
    api.addToClassWaitingList.mockClear();
    const n = await openAdd();
    await n.press("class-waiting-list-candidate-2");
    await n.press("class-waiting-list-confirm");
    expect(n.queryByTestId("class-waiting-list-eligibility-warning")).not.toBeNull();
    expect(api.addToClassWaitingList).not.toHaveBeenCalled();
    await n.press("class-waiting-list-confirm");
    await n.flush();
    expect(api.addToClassWaitingList).toHaveBeenCalledTimes(1);
  });

  it("a student who passes is added on the first press, with no warning", async () => {
    api.addToClassWaitingList.mockClear();
    const n = await openAdd();
    await n.press("class-waiting-list-candidate-1");
    await n.press("class-waiting-list-confirm");
    await n.flush();
    expect(api.addToClassWaitingList).toHaveBeenCalledTimes(1);
    expect(n.queryByTestId("class-waiting-list-eligibility-warning")).toBeNull();
  });
});
