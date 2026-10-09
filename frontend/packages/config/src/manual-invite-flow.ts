/**
 * eligibility.enforcement rule 6a / notifications.manual rule 8 (PAD-562): a manual invitation
 * asks first when any selected student fails the class's bar, through the same check and the
 * same dialog the manual add uses — one dialog for the whole selection. Kept out of the two
 * modals (web ManualNotificationModal, iOS NotifyModal) so the sequence is one contract with one
 * test: check, ask when anyone fails, send on confirm, nothing on cancel. A failed check falls
 * through to the send: the warning never blocks (rule 6).
 */
export interface ManualInviteFlowDeps<F> {
  /** The students the coach selected. */
  playerIds: string[];
  /** `POST /api/app/notify/eligibility_check` for the selection — the students who FAIL. */
  check: (playerIds: string[]) => Promise<F[]>;
  /** `POST /api/app/notify/manual` for the selection. */
  send: (playerIds: string[]) => Promise<void>;
  ui: {
    /** Open the confirmation; `proceed` is what its confirm button calls. */
    askEligibility: (failing: F[], proceed: () => Promise<void>) => void;
  };
}

export type ManualInviteFlowOutcome = "sent" | "asked";

export async function runManualInviteFlow<F>(deps: ManualInviteFlowDeps<F>): Promise<ManualInviteFlowOutcome> {
  const ids = deps.playerIds;
  if (ids.length === 0) return "sent";
  let failing: F[] = [];
  try {
    failing = await deps.check(ids);
  } catch {
    failing = []; // rule 6: the warning is a courtesy; a failed check never blocks the send
  }
  if (failing.length > 0) {
    deps.ui.askEligibility(failing, () => deps.send(ids));
    return "asked";
  }
  await deps.send(ids);
  return "sent";
}
