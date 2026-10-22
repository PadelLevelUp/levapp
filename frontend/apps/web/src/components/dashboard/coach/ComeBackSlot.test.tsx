/**
 * PAD-684 (attendance.confirm rule 28, dashboard.blocks rule 3a): a not_coming student's dashboard
 * row/hero renders the SERVER's `comeBack`. Asserted by test id; `t` returns the key.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
const api = vi.hoisted(() => ({
  respondToReminder: vi.fn(),
  joinClassWaitingList: vi.fn(() => Promise.resolve({ lessonInstanceId: 7, onWaitingList: true })),
}));
vi.mock("@/api/notificationEngine", () => ({ respondToReminder: api.respondToReminder }));
vi.mock("@/api/academyClasses", () => ({ joinClassWaitingList: api.joinClassWaitingList }));
import { ComeBackSlot } from "./ComeBackSlot";

const target = { model: "Lesson", originalId: 3, date: "2099-10-19" };
const item = (extra: Record<string, unknown> = {}) => ({
  lessonInstanceId: 7,
  attendanceState: "not_coming" as const,
  comeBack: "rejoin" as const,
  declineTarget: target,
  ...extra,
});

beforeEach(() => { api.respondToReminder.mockReset(); api.joinClassWaitingList.mockClear(); });
afterEach(cleanup);

describe("PAD-684 dashboard 'Afinal vou'", () => {
  it("rejoin: the button answers yes for the item's instance, then the dashboard refetches", async () => {
    api.respondToReminder.mockResolvedValue({ action: "confirmed" });
    const onAnswered = vi.fn();
    render(<ComeBackSlot item={item()} onAnswered={onAnswered} />);
    fireEvent.click(screen.getByTestId("dashboard-come-back"));
    await waitFor(() => expect(api.respondToReminder).toHaveBeenCalledWith(7, "yes"));
    await waitFor(() => expect(onAnswered).toHaveBeenCalled());
  });

  it("rejoin refused with spot_filled shows the waiting-list branch before the refetch lands", async () => {
    api.respondToReminder.mockResolvedValue({ action: "spot_filled" });
    render(<ComeBackSlot item={item()} onAnswered={() => new Promise(() => undefined)} />);
    fireEvent.click(screen.getByTestId("dashboard-come-back"));
    await screen.findByTestId("dashboard-come-back-spot-taken");
    expect(screen.getByTestId("dashboard-come-back-waiting-list")).toBeInTheDocument();
  });

  it("waiting_list: the spot-taken line and a join addressed by the item's declineTarget", async () => {
    const onAnswered = vi.fn();
    render(<ComeBackSlot item={item({ comeBack: "waiting_list" })} onAnswered={onAnswered} />);
    expect(screen.getByTestId("dashboard-come-back-spot-taken")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("dashboard-come-back-waiting-list"));
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith(target));
    await waitFor(() => expect(onAnswered).toHaveBeenCalled());
  });

  it("on_waiting_list: the state line only", () => {
    render(<ComeBackSlot item={item({ comeBack: "on_waiting_list" })} />);
    expect(screen.getByTestId("dashboard-come-back-on-waiting-list")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-come-back")).toBeNull();
  });

  it("an older server (no field) on a not_coming row keeps the PAD-570 hint", () => {
    render(<ComeBackSlot item={item({ comeBack: undefined })} />);
    expect(screen.getByTestId("dashboard-declined-hint")).toBeInTheDocument();
  });

  it("null (not offered) renders nothing", () => {
    const { container } = render(<ComeBackSlot item={item({ comeBack: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
