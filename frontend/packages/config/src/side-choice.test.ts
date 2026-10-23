import { describe, expect, it } from "vitest";
import {
  SIDE_CHOICE_ORDER,
  joinRequestAcceptedAtOnce,
  canSendSide,
  firstAndLastName,
  openSideWordKeys,
  preselectedSide,
  requestedSideChipKey,
  sideFullCopy,
  sideFullOf,
  sideHintKey,
  sideLabelKey,
  sideWordKey,
  suggestedProfileSideOf,
} from "./side-choice";

describe("preselectedSide (Q1, Q6)", () => {
  it("pre-selects the profile side, a both student included", () => {
    expect(preselectedSide("left")).toBe("left");
    expect(preselectedSide("right")).toBe("right");
    expect(preselectedSide("both")).toBe("both");
  });
  it("pre-selects nothing without a profile side", () => {
    expect(preselectedSide(null)).toBeNull();
    expect(preselectedSide(undefined)).toBeNull();
    expect(preselectedSide("")).toBeNull();
  });
  it("keeps send disabled until a side is chosen", () => {
    expect(canSendSide(null)).toBe(false);
    expect(canSendSide("both")).toBe(true);
  });
});

describe("wording keys", () => {
  it("orders the cards Direita, Esquerda, Ambos", () => {
    expect([...SIDE_CHOICE_ORDER]).toEqual(["right", "left", "both"]);
  });
  it("maps a side to its label, word and hint keys", () => {
    expect(sideLabelKey("right")).toBe("players.sideRight");
    expect(sideWordKey("both")).toBe("calendar.sidePick.word.both");
    expect(sideHintKey("left", "request")).toBe("calendar.sidePick.hint.left");
    expect(sideHintKey("left", "waiting")).toBe("calendar.sidePick.waitingHint.left");
  });
  it("shortens a name to first and last", () => {
    expect(firstAndLastName("Ana Maria Costa")).toBe("Ana Costa");
    expect(firstAndLastName("Rui Neves")).toBe("Rui Neves");
    expect(firstAndLastName("Rui")).toBe("Rui");
    expect(firstAndLastName(null)).toBe("");
  });
});

describe("the 409 side_full answer", () => {
  const err = (status: number, data: unknown) => ({ response: { status, data } });
  it("reads the requested and open sides", () => {
    const full = sideFullOf(err(409, { code: "side_full", sides: ["right"], requestedSide: "left" }));
    expect(full).toEqual({ requestedSide: "left", openSides: ["right"] });
    expect(openSideWordKeys(full!)).toEqual(["calendar.sidePick.word.right"]);
  });
  it("orders the open sides right, left", () => {
    expect(sideFullCopy(["left", "right"], "both")?.openSides).toEqual(["right", "left"]);
  });
  it("is null for any other error", () => {
    expect(sideFullOf(err(409, { code: "spot_filled" }))).toBeNull();
    expect(sideFullOf(err(500, { code: "side_full", requestedSide: "left" }))).toBeNull();
    expect(sideFullOf(err(409, { code: "side_full" }))).toBeNull();
    expect(sideFullOf(new Error("x"))).toBeNull();
    expect(sideFullOf(null)).toBeNull();
  });
});

describe("coach side", () => {
  it("shows a chip only for a side", () => {
    expect(requestedSideChipKey("both")).toBe("players.sideBoth");
    expect(requestedSideChipKey(null)).toBeNull();
  });
  it("suggests only left or right", () => {
    expect(suggestedProfileSideOf("left")).toBe("left");
    expect(suggestedProfileSideOf("both")).toBeNull();
    expect(suggestedProfileSideOf(null)).toBeNull();
  });
});

describe("joinRequestAcceptedAtOnce (PAD-672 slice 2, join-requests rule 21)", () => {
  it("is true only for a 201 request already accepted", () => {
    expect(joinRequestAcceptedAtOnce({ id: 1, status: "accepted" })).toBe(true);
    expect(joinRequestAcceptedAtOnce({ id: 1, status: "pending" })).toBe(false);
    expect(joinRequestAcceptedAtOnce(null)).toBe(false);
    expect(joinRequestAcceptedAtOnce(undefined)).toBe(false);
  });
});
