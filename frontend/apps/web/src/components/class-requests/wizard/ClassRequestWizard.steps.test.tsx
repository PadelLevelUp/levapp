/**
 * classes.class-requests rule 21: the private class is asked in three steps (people, when, time) under one
 * pinned foot. The whole wizard on web, the coaches, requests and availability mocked. `t` returns the key, so
 * everything is found by test id; the clock is pinned (Date only) and moved by hand for the 400 ms lock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PRIVATE_REQUEST_FREE_WINDOW,
  PRIVATE_REQUEST_NOTE,
  SINGLE_WITH_INVITEE_BODY,
  WEEKLY_AFTER_3_CLASSES_BODY,
} from "@levelup/config/src/private-request-bodies.fixture";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const requests = vi.hoisted(() => ({
  createClassRequest: vi.fn(),
  classRequestRefusal: () => null,
  listClassRequestCoaches: vi.fn(),
}));
vi.mock("@/api/classRequests", () => requests);
const availabilityApi = vi.hoisted(() => ({ getRequestParticipants: vi.fn(), getCoachAvailability: vi.fn() }));
const academyApi = vi.hoisted(() => ({ listAcademyClasses: vi.fn().mockResolvedValue({ classes: [] }) }));
vi.mock("@levelup/api", () => ({ requestAvailabilityApi: availabilityApi, academyClassesApi: academyApi }));

import { ClassRequestWizard } from "./ClassRequestWizard";

const T0 = new Date("2026-10-01T10:00:00Z").getTime();
let now = T0;
const setNow = (ms: number) => {
  now = ms;
  vi.setSystemTime(now);
};
/** Moves the clock past the 400 ms lock of the step that just showed. */
const passLock = () => setNow(now + 401);

const COACHES = [
  { id: "ana-id", name: "Ana" },
  { id: "bia-id", name: "Bia" },
];

function mount(open = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui = (o: boolean) => (
    <QueryClientProvider client={client}>
      <ClassRequestWizard open={o} onClose={vi.fn()} onDone={vi.fn()} />
    </QueryClientProvider>
  );
  const view = render(ui(open));
  return { ...view, setOpen: (o: boolean) => view.rerender(ui(o)) };
}

const stepOf = () => screen.getByTestId("class-request-wizard").getAttribute("data-step");
const privateStep = () => document.querySelector("[data-private-step]")?.getAttribute("data-private-step") ?? null;
const cont = () => screen.getByTestId("wizard-continue") as HTMLButtonElement;
const click = (id: string) => fireEvent.click(screen.getByTestId(id));

async function toPrivate(coachIds: string[] = ["ana-id"]) {
  const coaches = COACHES.filter((c) => coachIds.includes(c.id));
  requests.listClassRequestCoaches.mockResolvedValue(coaches);
  const view = mount();
  if (coaches.length > 1) fireEvent.click(await screen.findByTestId(`wizard-coach-${coaches[0].id}`));
  fireEvent.click(await screen.findByTestId("wizard-kind-private"));
  await waitFor(() => expect(privateStep()).toBe("people"));
  return view;
}
async function next(to: string) {
  passLock();
  click("wizard-continue");
  await waitFor(() => expect(privateStep()).toBe(to));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setNow(T0);
  availabilityApi.getCoachAvailability.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
    const freeWindows: Record<string, { startTime: string; endTime: string }[]> = {};
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86400000)) {
      freeWindows[d.toISOString().slice(0, 10)] = [{ ...PRIVATE_REQUEST_FREE_WINDOW }];
    }
    return { freeWindows, workingHoursSource: "custom" };
  });
  availabilityApi.getRequestParticipants.mockImplementation(async (_c: string, names: string[]) =>
    names.map((username) => (username === "nobody" ? { username, ok: false, code: "NOT_ON_ROSTER" } : { username, ok: true, name: username }))
  );
  requests.createClassRequest.mockReset().mockResolvedValue({});
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
});

describe("three steps that keep their answers (criterion 57)", () => {
  it("[CLASSES-CLASS-REQUESTS-57] each step shows its own questions, and the answers survive going back, the kind, and the same coach", async () => {
    await toPrivate();
    expect(stepOf()).toBe("private");
    expect(screen.queryByTestId("wizard-people-2")).not.toBeNull();
    expect(screen.queryByTestId("wizard-recurrence-weekly")).toBeNull();
    expect(screen.queryByTestId("wizard-slots")).toBeNull();
    expect(cont().disabled).toBe(false);

    click("wizard-people-2");
    expect(cont().disabled).toBe(true);
    fireEvent.change(screen.getByTestId("wizard-invitee-0"), { target: { value: "carla" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    await waitFor(() => expect(cont().disabled).toBe(false));
    await next("when");
    expect(screen.queryByTestId("wizard-people-2")).toBeNull();
    fireEvent.change(screen.getByTestId("wizard-date"), { target: { value: "2026-10-06" } });
    await next("time");
    expect(screen.queryByTestId("wizard-recurrence-weekly")).toBeNull();
    expect(screen.getByTestId("wizard-summary").textContent).toContain("carla");

    click("wizard-back");
    await waitFor(() => expect(privateStep()).toBe("when"));
    expect((screen.getByTestId("wizard-date") as HTMLInputElement).value).toBe("2026-10-06");
    click("wizard-back");
    await waitFor(() => expect(privateStep()).toBe("people"));
    expect(screen.getByTestId("wizard-people-2").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByTestId("wizard-invitee-0") as HTMLInputElement).value).toBe("carla");
    click("wizard-back");
    await waitFor(() => expect(stepOf()).toBe("kind"));
    click("wizard-kind-private");
    await waitFor(() => expect(privateStep()).toBe("people"));
    expect(screen.getByTestId("wizard-people-2").getAttribute("aria-pressed")).toBe("true");
    // The date confirmed in b has not moved.
    await next("when");
    expect((screen.getByTestId("wizard-date") as HTMLInputElement).value).toBe("2026-10-06");
  });

  it("[CLASSES-CLASS-REQUESTS-57] another coach starts clean, and so does coach A after B", async () => {
    await toPrivate(["ana-id", "bia-id"]);
    click("wizard-people-3");
    click("wizard-back");
    await waitFor(() => expect(stepOf()).toBe("kind"));
    click("wizard-back");
    await waitFor(() => expect(stepOf()).toBe("coach"));
    fireEvent.click(screen.getByTestId("wizard-coach-bia-id"));
    fireEvent.click(await screen.findByTestId("wizard-kind-private"));
    await waitFor(() => expect(privateStep()).toBe("people"));
    expect(screen.getByTestId("wizard-people-1").getAttribute("aria-pressed")).toBe("true");
    click("wizard-people-4");
    click("wizard-back");
    click("wizard-back");
    await waitFor(() => expect(stepOf()).toBe("coach"));
    fireEvent.click(screen.getByTestId("wizard-coach-ana-id"));
    fireEvent.click(await screen.findByTestId("wizard-kind-private"));
    await waitFor(() => expect(privateStep()).toBe("people"));
    expect(screen.getByTestId("wizard-people-1").getAttribute("aria-pressed")).toBe("true");
  });

  it("[CLASSES-CLASS-REQUESTS-57] a reopened sheet starts with an empty draft", async () => {
    const view = await toPrivate();
    click("wizard-people-3");
    view.setOpen(false);
    view.setOpen(true);
    fireEvent.click(await screen.findByTestId("wizard-kind-private"));
    await waitFor(() => expect(privateStep()).toBe("people"));
    expect(screen.getByTestId("wizard-people-1").getAttribute("aria-pressed")).toBe("true");
  });

  it("[CLASSES-CLASS-REQUESTS-57] with no free time and no invitees, step c shows rule 13b's list slot, Send stays disabled and the way back to b is offered", async () => {
    availabilityApi.getCoachAvailability.mockResolvedValue({ freeWindows: {}, workingHoursSource: "custom" });
    academyApi.listAcademyClasses.mockResolvedValue({
      classes: [{
        id: "1", model: "LessonInstance", originalId: "1", date: "2026-11-20", startTime: "18:00", endTime: "19:30",
        title: "Private 1", club: { name: "Douro Padel" }, classType: "private", state: "open", spotsLeft: 1, myJoinRequest: null, onWaitingList: false,
      }],
    });
    await toPrivate();
    await next("when");
    await next("time");
    await waitFor(() => expect(screen.getByTestId("wizard-slots").getAttribute("data-state")).toBe("empty"));
    expect((screen.getByTestId("wizard-send") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("wizard-change-when")).not.toBeNull();
    // Code review S6: rule 13b's list is in step c, under today's message.
    const list = await screen.findByTestId("wizard-private-lessons");
    expect(document.querySelector('[data-private-step="time"]')?.contains(list)).toBe(true);
    expect(screen.getByTestId("wizard-slots").compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("wizard-private-lesson-row-open")).toBeTruthy();
  });

  it("[CLASSES-CLASS-REQUESTS-57] Continuar in b makes the date the student's own: a first-free-day read that lands later does not move it (code review S5)", async () => {
    let release: (v: unknown) => void = () => undefined;
    availabilityApi.getCoachAvailability.mockImplementation(({ from, to }: { from: string; to: string }) =>
      from === to
        ? Promise.resolve({ freeWindows: { [from]: [{ ...PRIVATE_REQUEST_FREE_WINDOW }] }, workingHoursSource: "custom" })
        : new Promise((r) => { release = r; })
    );
    await toPrivate();
    await next("when");
    expect((screen.getByTestId("wizard-date") as HTMLInputElement).value).toBe("2026-10-01");
    await next("time");
    await act(async () => release({ freeWindows: { "2026-10-08": [{ ...PRIVATE_REQUEST_FREE_WINDOW }] }, workingHoursSource: "custom" }));
    click("wizard-back");
    await waitFor(() => expect(privateStep()).toBe("when"));
    expect((screen.getByTestId("wizard-date") as HTMLInputElement).value).toBe("2026-10-01");
  });
});

describe("what is sent is what the steps show (criterion 59)", () => {
  it("[CLASSES-CLASS-REQUESTS-59] what is sent is what the steps show: a single request with an invitee", async () => {
    await toPrivate();
    click("wizard-people-2");
    fireEvent.change(screen.getByTestId("wizard-invitee-0"), { target: { value: "carla" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    await waitFor(() => expect(cont().disabled).toBe(false));
    await next("when");
    fireEvent.change(screen.getByTestId("wizard-date"), { target: { value: SINGLE_WITH_INVITEE_BODY.date } });
    await next("time");
    fireEvent.change(screen.getByTestId("wizard-note"), { target: { value: PRIVATE_REQUEST_NOTE } });
    fireEvent.click(await screen.findByTestId("wizard-slot"));
    await waitFor(() => expect((screen.getByTestId("wizard-send") as HTMLButtonElement).disabled).toBe(false));
    passLock();
    click("wizard-send");
    await waitFor(() => expect(requests.createClassRequest).toHaveBeenCalledTimes(1));
    expect(requests.createClassRequest.mock.calls[0][0]).toEqual(SINGLE_WITH_INVITEE_BODY);
  });

  it("[CLASSES-CLASS-REQUESTS-59] what is sent is what the steps show: a weekly request ending after 3 classes", async () => {
    await toPrivate();
    await next("when");
    click("wizard-recurrence-weekly");
    click("wizard-weekday-2");
    fireEvent.change(screen.getByTestId("wizard-start-date"), { target: { value: WEEKLY_AFTER_3_CLASSES_BODY.recurrence.startDate } });
    click("request-end-mode-count");
    click("request-end-count-dec");
    expect(screen.getByTestId("request-end-count").textContent).toBe("3");
    await next("time");
    fireEvent.click(await screen.findByTestId("wizard-slot"));
    passLock();
    click("wizard-send");
    await waitFor(() => expect(requests.createClassRequest).toHaveBeenCalledTimes(1));
    expect(requests.createClassRequest.mock.calls[0][0]).toEqual(WEEKLY_AFTER_3_CLASSES_BODY);
  });
});

describe("invalid answers never pass a step (criterion 61)", () => {
  it("[CLASSES-CLASS-REQUESTS-61] invalid answers never pass a step: a refused or repeated username", async () => {
    await toPrivate();
    click("wizard-people-3");
    fireEvent.change(screen.getByTestId("wizard-invitee-0"), { target: { value: "nobody" } });
    fireEvent.change(screen.getByTestId("wizard-invitee-1"), { target: { value: "carla" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(cont().disabled).toBe(true);
    fireEvent.change(screen.getByTestId("wizard-invitee-0"), { target: { value: "carla" } });
    fireEvent.change(screen.getByTestId("wizard-invitee-1"), { target: { value: " Carla " } });
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(cont().disabled).toBe(true);
    passLock();
    click("wizard-continue");
    expect(privateStep()).toBe("people");
  });

  it("[CLASSES-CLASS-REQUESTS-61] invalid answers never pass a step: an empty and a past date, and a cleared weekly start", async () => {
    await toPrivate();
    await next("when");
    fireEvent.change(screen.getByTestId("wizard-date"), { target: { value: "" } });
    expect(cont().disabled).toBe(true);
    fireEvent.change(screen.getByTestId("wizard-date"), { target: { value: "2026-09-30" } });
    expect(cont().disabled).toBe(true);
    fireEvent.change(screen.getByTestId("wizard-date"), { target: { value: "2026-10-01" } });
    expect(cont().disabled).toBe(false);
    click("wizard-recurrence-weekly");
    click("wizard-weekday-2");
    for (const mode of ["date", "count"]) {
      click(`request-end-mode-${mode}`);
      expect(() => fireEvent.change(screen.getByTestId("wizard-start-date"), { target: { value: "" } })).not.toThrow();
      expect(cont().disabled).toBe(true);
      fireEvent.change(screen.getByTestId("wizard-start-date"), { target: { value: "2026-10-06" } });
      expect(cont().disabled).toBe(false);
    }
  });
});

describe("the lock and the double tap (criterion 66)", () => {
  it("[CLASSES-CLASS-REQUESTS-66] the lock and the double tap: under 400 ms nothing, at 401 one step", async () => {
    await toPrivate();
    setNow(now + 399);
    click("wizard-continue");
    expect(privateStep()).toBe("people");
    setNow(now + 2); // 401 ms after the step showed
    click("wizard-continue");
    await waitFor(() => expect(privateStep()).toBe("when"));
  });

  it("[CLASSES-CLASS-REQUESTS-66] the lock and the double tap: two presses 100 ms apart move one step, not two", async () => {
    await toPrivate();
    passLock();
    click("wizard-continue");
    setNow(now + 100);
    click("wizard-continue");
    await waitFor(() => expect(privateStep()).toBe("when"));
    setNow(now + 100);
    expect(privateStep()).toBe("when");
  });
});

describe("a double tap never sends (code review S2)", () => {
  it("[CLASSES-CLASS-REQUESTS-66] c, back to b, Continuar twice 100 ms apart: one step, no request sent", async () => {
    await toPrivate();
    await next("when");
    await next("time");
    fireEvent.click(await screen.findByTestId("wizard-slot"));
    await waitFor(() => expect((screen.getByTestId("wizard-send") as HTMLButtonElement).disabled).toBe(false));
    click("wizard-back");
    await waitFor(() => expect(privateStep()).toBe("when"));
    passLock();
    click("wizard-continue");
    await waitFor(() => expect(privateStep()).toBe("time"));
    // The slot kept from before is still picked, so Send is enabled the moment c shows.
    expect((screen.getByTestId("wizard-send") as HTMLButtonElement).disabled).toBe(false);
    setNow(now + 100);
    click("wizard-send");
    expect(requests.createClassRequest).not.toHaveBeenCalled();
    setNow(now + 400);
    click("wizard-send");
    await waitFor(() => expect(requests.createClassRequest).toHaveBeenCalledTimes(1));
  });
});

describe("a step change is announced (criterion 62)", () => {
  it("[CLASSES-CLASS-REQUESTS-62] the step's title takes the focus", async () => {
    await toPrivate();
    const title = () => screen.getByTestId("wizard-step-title");
    expect(title().textContent).toBe("classRequestWizard.steps.people");
    await next("when");
    expect(document.activeElement).toBe(title());
    expect(title().textContent).toBe("classRequestWizard.steps.when");
    await next("time");
    expect(document.activeElement).toBe(title());
    click("wizard-back");
    await waitFor(() => expect(privateStep()).toBe("when"));
    expect(document.activeElement).toBe(title());
  });
});

describe("the sheet follows the visible viewport (criterion 64)", () => {
  function viewport(height: number) {
    const vv = Object.assign(new EventTarget(), { height, offsetTop: 0, width: 390 });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    return vv;
  }
  it("[CLASSES-CLASS-REQUESTS-64] the sheet follows the visible viewport", async () => {
    const vv = viewport(800);
    await toPrivate();
    const sheet = () => screen.getByTestId("class-request-wizard") as HTMLElement;
    expect(sheet().style.maxHeight).toBe("736px");
    vv.height = 400;
    act(() => void vv.dispatchEvent(new Event("resize")));
    expect(sheet().style.maxHeight).toBe("368px");
    expect(sheet().style.bottom).toBe("400px");
    vv.height = 800;
    act(() => void vv.dispatchEvent(new Event("resize")));
    expect(sheet().style.maxHeight).toBe("736px");
  });
  it("[CLASSES-CLASS-REQUESTS-64] without that browser support the sheet keeps its max-h-[92vh]", async () => {
    await toPrivate();
    expect(screen.getByTestId("class-request-wizard").className).toContain("max-h-[92vh]");
    expect((screen.getByTestId("class-request-wizard") as HTMLElement).style.maxHeight).toBe("");
  });
});
