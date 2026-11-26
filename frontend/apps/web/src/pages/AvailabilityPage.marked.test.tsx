/**
 * calendar.student-blockers rules 19, 21 (PAD-772, owner correction 26 Nov 2026): the Disponibilidade tab saves a
 * block, says how many classes the server marked "Não vai" and asks nothing. Asserted by test id and by what is
 * sent; `t` returns the key (with the count when there is one).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const toast = vi.hoisted(() => vi.fn());
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, o?: { count?: number }) => (o?.count !== undefined ? `${key}:${o.count}` : key),
    i18n: { language: "pt" },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/class-requests/ClassRequestsSection", () => ({ ClassRequestsSection: () => null }));
const api = vi.hoisted(() => ({
  listBlockers: vi.fn(),
  createBlocker: vi.fn(),
  updateBlocker: vi.fn(),
  deleteBlocker: vi.fn(),
}));
vi.mock("@/api/availability", () => api);

import AvailabilityPage from "@/pages/AvailabilityPage";

const wed = { model: "Lesson", originalId: 7, date: "2026-12-02", lessonInstanceId: 11, title: "Quarta", start: "2026-12-02T19:00:00", end: "2026-12-02T20:00:00" };
const tue = { model: "LessonInstance", originalId: 9, date: "2026-12-08", lessonInstanceId: 9, title: "Terça", start: "2026-12-08T18:00:00", end: "2026-12-08T19:00:00" };
const saved = { id: 5, userId: 1, type: "unavailable", title: null, description: null, isRecurring: false, recurrenceRule: null, recurrenceEnd: null, blocksAutoInvitations: true, date: "2026-12-02", startTime: "08:00", endTime: "09:00" };

afterEach(() => {
  vi.clearAllMocks();
});

async function saveABlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidated = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <AvailabilityPage />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByTestId("availability-create-blocker"));
  fireEvent.change(await screen.findByTestId("blocker-date"), { target: { value: "2026-12-02" } });
  fireEvent.click(screen.getByTestId("blocker-save"));
  return invalidated;
}
const keys = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));

describe("a block save says how many classes it marked (PAD-772)", () => {
  it("[CALENDAR-STUDENT-BLOCKERS-24] a save over classes says how many were marked and asks nothing", async () => {
    api.listBlockers.mockResolvedValue([saved]);
    api.createBlocker.mockResolvedValue({ ...saved, markedClasses: [wed, tue], coveredClasses: [] });
    const invalidated = await saveABlock();

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "availability.covered.marked:2" }));
    // No dialog, no other write than the save, and the calendar and dashboard are read again.
    expect(screen.queryByTestId("blocker-covered-dialog")).toBeNull();
    expect(api.createBlocker).toHaveBeenCalledTimes(1);
    expect(Object.keys(api)).toEqual(["listBlockers", "createBlocker", "updateBlocker", "deleteBlocker"]);
    expect(keys(invalidated)).toEqual(expect.arrayContaining([JSON.stringify(["calendar-events"]), JSON.stringify(["dashboard"])]));
    expect(await screen.findByTestId("blocker-card-5")).toBeTruthy();
  });

  it("[CALENDAR-STUDENT-BLOCKERS-24] a save answering no marked classes shows only the ordinary save", async () => {
    api.listBlockers.mockResolvedValue([saved]);
    api.createBlocker.mockResolvedValue({ ...saved, markedClasses: [], coveredClasses: [] });
    const invalidated = await saveABlock();
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "availability.addedToast" }));
    expect(toast).toHaveBeenCalledTimes(1);
    expect(keys(invalidated)).not.toContain(JSON.stringify(["calendar-events"]));
  });

  it("[CALENDAR-STUDENT-BLOCKERS-24] a failure after the save never says the block was not saved", async () => {
    api.listBlockers.mockResolvedValue([saved]);
    api.createBlocker.mockResolvedValue({ ...saved, markedClasses: [wed] });
    toast.mockImplementation((arg: { title?: string }) => {
      if (arg.title?.startsWith("availability.covered.marked")) throw new Error("toast broke");
    });
    await saveABlock();
    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "availability.covered.marked:1" }));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: "availability.couldNotSaveTitle" }));
    expect(await screen.findByTestId("blocker-card-5")).toBeTruthy();
  });
});
