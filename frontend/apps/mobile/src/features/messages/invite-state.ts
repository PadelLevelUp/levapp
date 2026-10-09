/**
 * What a `notification_invite` message shows (PAD-563, notifications.invitations rule 9).
 *
 * Pulled out of `message-bubble.tsx` so the four resolved states and the "by the coach" line
 * are unit-tested without mounting gestures. Mirrors the derivation web's `MessageBubble`
 * does inline for `messageType === "notification_invite"`.
 */

export type InviteMetadata = {
  responded?: boolean;
  response?: string;
  /** Who gave the recorded answer (PAD-548/563). */
  answeredBy?: "student" | "coach";
};

export type InviteState = {
  /** A yes is on record — the Accepted badge. */
  accepted: boolean;
  /** A no is on record — the Declined badge. */
  declined: boolean;
  /** Answered, but neither yes nor no: retired, withdrawn or a refused yes — "Vaga preenchida". */
  spotFilled: boolean;
  /** The answer was recorded by the coach — the badge says so (PAD-563). */
  byCoach: boolean;
  /** Nothing on record: the sender sees "waiting", the student sees Yes/No. */
  waiting: boolean;
};

export function inviteState(metadata: InviteMetadata | undefined): InviteState {
  const responded = !!metadata?.responded;
  const response = metadata?.response;
  const accepted = responded && response === "yes";
  const declined = responded && response === "no";
  return {
    accepted,
    declined,
    spotFilled: responded && !accepted && !declined,
    byCoach: responded && metadata?.answeredBy === "coach" && (accepted || declined),
    waiting: !responded,
  };
}
