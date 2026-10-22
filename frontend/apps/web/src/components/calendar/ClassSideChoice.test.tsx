/**
 * PAD-672 slice 1 (classes.join-requests rule 20): the side sheet in front of a join request or a
 * waiting-list join. Pre-selection of the profile side (Q1), the mandatory case (Q6), the request
 * carrying the side, and the 409 `side_full` two-way choice. Located by test id and role (R-013).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  createClassJoinRequest: vi.fn(),
  joinClassWaitingList: vi.fn(),
}));
vi.mock("@/api/classJoinRequests", () => ({ createClassJoinRequest: api.createClassJoinRequest }));
vi.mock("@/api/academyClasses", () => ({ joinClassWaitingList: api.joinClassWaitingList }));

import i18n from "@/i18n";
import { ClassSideChoice, type ClassSideChoiceProps } from "./ClassSideChoice";

const tr = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);
const EVENT = { model: "ClassInstance", originalId: 7, date: "2099-10-19" };
const sideFull = (sides: string[], requestedSide: string) => ({
  response: { status: 409, data: { code: "side_full", message: "x", sides, requestedSide } },
});

function renderSheet(extra: Partial<ClassSideChoiceProps> = {}) {
  const props: ClassSideChoiceProps = {
    open: true,
    onOpenChange: vi.fn(),
    mode: "request",
    event: EVENT,
    profileSide: "left",
    onRequestSent: vi.fn(),
    onWaitingListJoined: vi.fn(),
    onFailed: vi.fn(),
    ...extra,
  };
  render(<ClassSideChoice {...props} />);
  return props;
}

beforeEach(() => {
  api.createClassJoinRequest.mockReset().mockResolvedValue({ id: 1, status: "pending", side: "left" });
  api.joinClassWaitingList.mockReset().mockResolvedValue({ lessonInstanceId: 7, onWaitingList: true, side: "right" });
});

describe("the side sheet", () => {
  it("lists Direita, Esquerda, Ambos and pre-selects the profile side, tagged Habitual", () => {
    renderSheet({ profileSide: "left" });
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("data-testid"))).toEqual([
      "class-side-right",
      "class-side-left",
      "class-side-both",
    ]);
    expect(screen.getByTestId("class-side-left").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("class-side-right").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("class-side-usual-left")).toBeTruthy();
    expect(screen.queryByTestId("class-side-usual-right")).toBeNull();
    expect((screen.getByTestId("class-side-send") as HTMLButtonElement).disabled).toBe(false);
  });

  it("asks a 'both' student too, with Ambos pre-selected", () => {
    renderSheet({ profileSide: "both" });
    expect(screen.getByTestId("class-side-both").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("class-side-usual-both")).toBeTruthy();
  });

  it("pre-selects nothing without a profile side and keeps Enviar disabled until one is chosen", () => {
    renderSheet({ profileSide: null });
    expect(screen.getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    const send = screen.getByTestId("class-side-send") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("class-side-right"));
    expect(send.disabled).toBe(false);
  });

  it("sends the request with the chosen side and the note, then reports it", async () => {
    const props = renderSheet({ profileSide: "left", note: "chego cedo" });
    fireEvent.click(screen.getByTestId("class-side-right"));
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() => expect(api.createClassJoinRequest).toHaveBeenCalledWith(EVENT, "chego cedo", "right"));
    await waitFor(() => expect(props.onRequestSent).toHaveBeenCalled());
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("in the waiting-list theme joins the list with the chosen side", async () => {
    const props = renderSheet({ mode: "waiting", profileSide: "right" });
    expect(screen.getByTestId("class-side-choice").getAttribute("data-mode")).toBe("waiting");
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith(EVENT, "right"));
    expect(api.createClassJoinRequest).not.toHaveBeenCalled();
    await waitFor(() => expect(props.onWaitingListJoined).toHaveBeenCalledWith("right"));
  });

  it("reports any other failure to the caller and closes", async () => {
    api.createClassJoinRequest.mockRejectedValueOnce({ response: { status: 409, data: { code: "spot_filled" } } });
    const props = renderSheet();
    fireEvent.click(screen.getByTestId("class-side-send"));
    await waitFor(() => expect(props.onFailed).toHaveBeenCalledWith(expect.anything(), "request"));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe("409 side_full", () => {
  it("replaces the body with the two choices, naming the sides", async () => {
    api.createClassJoinRequest.mockRejectedValueOnce(sideFull(["right"], "left"));
    renderSheet({ profileSide: "left" });
    fireEvent.click(screen.getByTestId("class-side-send"));
    expect((await screen.findByTestId("class-side-full-title")).textContent).toBe(
      tr("calendar.sidePick.fullTitle", { requested: "esquerda" }),
    );
    expect(screen.getByTestId("class-side-full-title").textContent).toBe("Não há vaga na esquerda");
    expect(screen.getByTestId("class-side-full-body").textContent).toBe(
      "Há vaga na direita. Podes jogar em ambos os lados, ou esperar por uma vaga na esquerda.",
    );
    expect(screen.queryByTestId("class-side-options")).toBeNull();
    expect(screen.getByTestId("class-side-play-both").textContent).toBe("Estou disposto a jogar em ambos");
    expect(screen.getByTestId("class-side-stay-waiting").textContent).toBe("Ficar na lista de espera da esquerda");
  });

  it("'Estou disposto a jogar em ambos' resends the same request with side both", async () => {
    api.createClassJoinRequest.mockRejectedValueOnce(sideFull(["right"], "left"));
    api.createClassJoinRequest.mockResolvedValueOnce({ id: 2, status: "pending", side: "both" });
    const props = renderSheet({ profileSide: "left", note: "n" });
    fireEvent.click(screen.getByTestId("class-side-send"));
    fireEvent.click(await screen.findByTestId("class-side-play-both"));
    await waitFor(() => expect(api.createClassJoinRequest).toHaveBeenCalledTimes(2));
    expect(api.createClassJoinRequest).toHaveBeenLastCalledWith(EVENT, "n", "both");
    await waitFor(() => expect(props.onRequestSent).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), "both"));
    expect(api.joinClassWaitingList).not.toHaveBeenCalled();
  });

  it("'Ficar na lista de espera' joins that side's waiting list instead", async () => {
    api.createClassJoinRequest.mockRejectedValueOnce(sideFull(["right"], "left"));
    const props = renderSheet({ profileSide: "left" });
    fireEvent.click(screen.getByTestId("class-side-send"));
    fireEvent.click(await screen.findByTestId("class-side-stay-waiting"));
    await waitFor(() => expect(api.joinClassWaitingList).toHaveBeenCalledWith(EVENT, "left"));
    expect(api.createClassJoinRequest).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(props.onWaitingListJoined).toHaveBeenCalledWith("left"));
  });
});
