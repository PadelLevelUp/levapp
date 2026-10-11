/**
 * PAD-577 (notifications.invitations rule 15a): whether a student's invitation bubble offers
 * "Juntar-me à lista de espera", one rule for both shells. The offer exists only for an invitation
 * retired because someone else took the spot (`response: "spot_filled"`), for a class still ahead
 * (`startsAt` on the message when the server wrote it), and when the student is not already on
 * that class's list. A timeout (`expired`), the coach's withdrawal (`withdrawn`) or the student's
 * own answer never offers it.
 */
import { wallClockISOMs } from "./club-date";

export type InviteWaitingListMetadata = {
  responded?: boolean;
  response?: string;
  lessonInstanceId?: number | string | null;
  /** The class's start on the club clock, ISO without zone; absent on messages from before PAD-577. */
  startsAt?: string | null;
};

/** The responses that offer the class's waiting list: the spot went to someone else ("spot_filled",
 * PAD-577/609), or the engine withdrew the invitation for side balance ("side_balanced", PAD-581). */
const OFFERS_WAITING_LIST = new Set(["spot_filled", "side_balanced"]);

export function invitationLostToAnother(metadata: InviteWaitingListMetadata | undefined): boolean {
  return !!metadata?.responded && OFFERS_WAITING_LIST.has(metadata?.response ?? "");
}

/** PAD-581 (invitations rule 2d): withdrawn because the spot now asks for the other side. */
export function invitationWithdrawnForBalance(metadata: InviteWaitingListMetadata | undefined): boolean {
  return !!metadata?.responded && metadata?.response === "side_balanced";
}

/** The badge of a retired invitation, both shells: "Já não é preciso deste lado" for a balance
 * withdrawal (PAD-581), "Vaga preenchida" for every other end that is neither yes nor no. */
export function retiredInviteLabelKey(metadata: InviteWaitingListMetadata | undefined): string {
  return invitationWithdrawnForBalance(metadata) ? "messages.noLongerNeededOnSide" : "messages.spotFilled";
}

/**
 * `startsAt` is the server's naive `isoformat()` of the class's club wall-clock start; it is read
 * digit by digit (`wallClockISOMs`) and compared against the club's wall-clock "now" (`lisbonNowMs`),
 * as every other client deadline is. An older message without it, or one that cannot be read,
 * still offers: the join's `class_closed` refusal then decides.
 */
export function invitationClassStillAhead(metadata: InviteWaitingListMetadata | undefined, nowWallMs: number): boolean {
  const startsAt = metadata?.startsAt;
  if (!startsAt) return true;
  const ms = wallClockISOMs(startsAt);
  return Number.isNaN(ms) ? true : ms > nowWallMs;
}

export function offersWaitingListJoin(
  metadata: InviteWaitingListMetadata | undefined,
  opts: { nowWallMs: number; onWaitingList: boolean },
): boolean {
  if (!invitationLostToAnother(metadata)) return false;
  if (opts.onWaitingList) return false;
  if (metadata?.lessonInstanceId == null) return false;
  return invitationClassStillAhead(metadata, opts.nowWallMs);
}
