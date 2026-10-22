/**
 * PAD-672 slice 1 (classes.join-requests rule 20, classes.academy-class-booking rule 6,
 * notifications.waiting-list rule 4d): the student names the side they will play in a class when
 * they ask to join it or join its waiting list. Pure, so web and iOS (whose unit runner cannot
 * mount a component) share one rule for the default, the wording and the 409 `side_full` answer.
 */
import type { PlayerSide } from "@levelup/types";

export type ClassSide = PlayerSide;

/** The order of the three cards: Direita, Esquerda, Ambos (the owner's mock). */
export const SIDE_CHOICE_ORDER: readonly ClassSide[] = ["right", "left", "both"];

export function isClassSide(value: unknown): value is ClassSide {
  return value === "left" || value === "right" || value === "both";
}

/**
 * Q1: the card pre-selected is the student's profile side (a `both` student is asked too and gets
 * `both`). Q6: with no profile side nothing is pre-selected and the answer is mandatory.
 */
export function preselectedSide(profileSide: unknown): ClassSide | null {
  return isClassSide(profileSide) ? profileSide : null;
}

/** The send button stays disabled until a side is chosen (Q6). */
export function canSendSide(chosen: ClassSide | null): chosen is ClassSide {
  return chosen !== null;
}

/** i18n key of the card title: "Direita" / "Esquerda" / "Ambos" (reuses players.sideX). */
export function sideLabelKey(side: ClassSide): string {
  return side === "left" ? "players.sideLeft" : side === "right" ? "players.sideRight" : "players.sideBoth";
}

/** i18n key of the lower-case word used in sentences: "direita" / "esquerda" / "ambos". */
export function sideWordKey(side: ClassSide): string {
  return `calendar.sidePick.word.${side}`;
}

/** i18n key of a card's hint; `waiting` swaps the wording to "when a spot opens". */
export function sideHintKey(side: ClassSide, mode: "request" | "waiting"): string {
  return `calendar.sidePick.${mode === "waiting" ? "waitingHint" : "hint"}.${side}`;
}

/** The first word of a person's name plus the last: "Ana Maria Costa" -> "Ana Costa". */
export function firstAndLastName(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

/** What a refused request (`409 side_full`) says: the side asked for and the sides that are open. */
export interface SideFull {
  requestedSide: ClassSide;
  /** Only left/right: the sides of the open spots (a spot of `both` is not a side). */
  openSides: Array<"left" | "right">;
}

export function sideFullCopy(sides: unknown, requestedSide: unknown): SideFull | null {
  if (!isClassSide(requestedSide)) return null;
  const list = Array.isArray(sides) ? sides : [];
  const openSides = (["right", "left"] as const).filter((s) => list.includes(s));
  return { requestedSide, openSides };
}

/**
 * The `409 {code: "side_full", sides, requestedSide}` of a join request, or null when the error is
 * anything else (the caller then shows its ordinary failure).
 */
export function sideFullOf(error: unknown): SideFull | null {
  const res = (error as { response?: { status?: unknown; data?: unknown } } | null)?.response;
  if (!res || res.status !== 409) return null;
  const data = res.data as { code?: unknown; sides?: unknown; requestedSide?: unknown } | null;
  if (!data || data.code !== "side_full") return null;
  return sideFullCopy(data.sides, data.requestedSide);
}

/**
 * PAD-672 slice 2 (classes.join-requests rule 21): a join request the coach's automatic acceptance
 * took at once answers 201 with `status: "accepted"`; the student is enrolled already.
 */
export function joinRequestAcceptedAtOnce(request: unknown): boolean {
  return (request as { status?: unknown } | null | undefined)?.status === "accepted";
}

/** The i18n keys of the open sides, in the display order (right, left). */
export function openSideWordKeys(full: SideFull): string[] {
  return full.openSides.map((s) => sideWordKey(s));
}

/** What the student's own request shows once sent: "Lado: <lado> · aguarda o <coach>". */
export function sentLineParams(side: ClassSide | null | undefined, coachName: string | null | undefined) {
  return {
    sideKey: side ? sideWordKey(side) : null,
    coach: firstAndLastName(coachName),
  };
}

/** Q4: the standing-list add defaults to the player's profile side (a left/right/both value). */
export function standingDefaultSide(profileSide: unknown): ClassSide | null {
  return preselectedSide(profileSide);
}

/** The label of a join-request chip on the coach's row, null for a request with no side. */
export function requestedSideChipKey(side: unknown): string | null {
  return isClassSide(side) ? sideLabelKey(side) : null;
}

/** "Usar <lado> no perfil": only for a suggested left/right side. */
export function suggestedProfileSideOf(value: unknown): "left" | "right" | null {
  return value === "left" || value === "right" ? value : null;
}
