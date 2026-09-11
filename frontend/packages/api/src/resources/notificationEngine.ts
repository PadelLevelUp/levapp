import type {
  EligibilityCheckResult,
  EligibilityImpact,
  ApprovalAction,
  ApprovalVacancyResult,
  InviteExplain,
  InviteSimulation,
  InviteSimulationRequest,
  NotificationConfig,
  NotificationEventItem,
  StudentGroup,
  MessageTemplates,
  StandingWaitingListEntry,
} from "@levelup/types";
import { getApi } from "../client";

export async function searchPlayers(query: string): Promise<{ players: { id: string; name: string }[] }> {
  const res = await getApi().get("/app/notify/player_search", { params: { q: query } });
  return res.data;
}

export async function getNotificationConfig(): Promise<NotificationConfig> {
  const res = await getApi().get("/app/notify/config");
  return res.data;
}

/**
 * Saves a config patch. When the patch touched `eligibilityRules` the server
 * adds `eligibilityImpact.affected` — the enrolled students the new bar would
 * have excluded (PAD-133, `eligibility.enforcement` rule 9a). Informational:
 * nobody is un-enrolled or notified.
 */
export async function updateNotificationConfig(
  data: Partial<NotificationConfig>
): Promise<NotificationConfig & { eligibilityImpact?: EligibilityImpact }> {
  const res = await getApi().post("/app/notify/config", data);
  return res.data;
}

/**
 * Which of `playerIds` would fail the class's eligibility bar, and why
 * (PAD-133 / PAD-150, `eligibility.enforcement` rules 6–7c). Called BEFORE a
 * manual add so the coach can be asked; an empty `ineligible` means no prompt.
 * Structured reasons only — render them with `describeEligibilityFailure`.
 */
export async function checkEligibility(
  model: string,
  originalId: string | number,
  date: string | null | undefined,
  playerIds: Array<string | number>
): Promise<EligibilityCheckResult> {
  const res = await getApi().post("/app/notify/eligibility_check", {
    model,
    originalId,
    date: date ?? null,
    playerIds,
  });
  return { ineligible: res.data?.ineligible ?? [] };
}

export async function toggleLessonNotifications(
  model: string,
  originalId: string,
  date: string
): Promise<{ notificationsEnabled: boolean }> {
  const res = await getApi().post("/app/notify/toggle_class", { model, originalId, date });
  return res.data;
}

/**
 * A student the backend skipped rather than sent to, so both notify routes
 * report WHO was skipped alongside how many were actually reached. (`sent` used
 * to be the enrolment count on the reminder route, which lied as soon as
 * anybody was skipped.)
 *
 * Two independent reasons a student lands here, and the shape is shared:
 *  - PAD-107 — they marked themselves unavailable for this class slot. The
 *    backend deliberately returns the name only, never the blocker's title,
 *    description or hours: that is the student's private calendar.
 *  - PAD-112 — they opted out of invitations. `reason` carries the student's
 *    own free-text explanation, which IS meant to be coach-visible.
 *
 * So `reason` is present only for the PAD-112 case. PAD-107 and PAD-112 each
 * introduced this interface under a different name; the batch merge kept one
 * declaration and aliased the other so both tickets' components still compile.
 */
export interface BlockedStudent {
  playerId: number;
  name: string;
  /**
   * Which kind of block this is. Split on THIS, never on `reason` being empty —
   * a student can turn invitations off without giving a reason.
   */
  cause?: "unavailable" | "preference";
  /** PAD-112 only: the student's own free-text reason; absent when they gave none. */
  reason?: string;
}

export type BlockedRecipient = BlockedStudent;

export async function sendClassReminders(
  model: string,
  originalId: string,
  date: string
): Promise<{ sent: number; blocked: BlockedStudent[] }> {
  const res = await getApi().post("/app/notify/send_reminders", { model, originalId, date });
  return { blocked: [], ...res.data };
}

export async function sendManualNotifications(
  model: string,
  originalId: string,
  date: string,
  playerIds: string[]
): Promise<{ sent: number; blocked: BlockedStudent[] }> {
  const res = await getApi().post("/app/notify/manual", { model, originalId, date, playerIds });
  return { blocked: [], ...res.data };
}

/**
 * PAD-107: which of `playerIds` are unavailable for the proposed class window?
 * Called before a class is created, when no LessonInstance exists yet.
 */
export async function checkAvailabilityConflicts(
  date: string,
  startTime: string,
  endTime: string,
  playerIds: string[]
): Promise<BlockedStudent[]> {
  const res = await getApi().post("/app/notify/availability_conflicts", {
    date,
    startTime,
    endTime,
    playerIds,
  });
  return res.data?.blocked ?? [];
}

export async function getNotificationActivity(): Promise<NotificationEventItem[]> {
  const res = await getApi().get("/app/notify/activity");
  return res.data;
}

export async function getNotificationGroups(
  model: string,
  originalId: string,
  date: string
): Promise<StudentGroup[]> {
  const res = await getApi().get("/app/notify/groups", {
    params: { model, originalId, date },
  });
  return res.data;
}

export async function respondToNotification(
  notificationEventId: number,
  action: "yes" | "no"
  // "expired" is PAD-68 (the class already started; nothing recorded) and
  // "spot_filled_waiting_list_offered" is the "sorry, just filled" path that
  // also sends a waiting_list_offer — both were always returned by the server;
  // PAD-236 names them so the dashboard cards can react to them.
): Promise<{
  action:
    | "confirmed"
    | "declined"
    | "spot_filled"
    | "spot_filled_waiting_list_offered"
    | "expired"
    | "unknown";
}> {
  const res = await getApi().post("/app/notify/respond", { notificationEventId, action });
  return res.data;
}

export async function coachRespondToNotification(
  notificationEventId: number,
  action: "yes" | "no"
): Promise<{ action: "confirmed" | "declined" | "spot_filled" | "unknown" }> {
  const res = await getApi().post("/app/notify/coach_respond", { notificationEventId, action });
  return res.data;
}

export async function respondToApproval(
  bundleId: string,
  action: ApprovalAction
): Promise<{
  action: ApprovalAction;
  vacancies: { vacancyId: number; result: ApprovalVacancyResult }[];
}> {
  const res = await getApi().post("/app/notify/approval/respond", { bundleId, action });
  return res.data;
}

export async function respondToReminder(
  lessonInstanceId: number,
  action: "yes" | "no"
  // PAD-68: "expired" when the class has already started — the answer is not
  // recorded and no replacement invitations are sent.
): Promise<{ action: "confirmed" | "declined" | "expired" }> {
  const res = await getApi().post("/app/notify/respond_reminder", { lessonInstanceId, action });
  return res.data;
}

/**
 * PAD-288 / PAD-282 (`attendance.confirm` rule 18): a cancel on an occurrence
 * that has no instance row yet is addressed the way the calendar event carries
 * it — `model` + `originalId` + `date` — and the server materialises it first.
 */
export interface CancelAttendanceTarget {
  model: string;
  originalId: string | number;
  date: string;
}

export async function cancelAttendance(
  target: number | CancelAttendanceTarget
  // PAD-73: `proactive` is the SERVER's classification — true when the decline
  // landed before the instant this student's attendance reminder would have
  // fired. The client never derives this cutoff itself.
): Promise<{ action: "declined"; proactive?: boolean }> {
  const body =
    typeof target === "number"
      ? { lessonInstanceId: target }
      : { model: target.model, originalId: String(target.originalId), date: target.date };
  const res = await getApi().post("/app/notify/cancel_attendance", body);
  return res.data;
}

export async function respondToWaitingList(
  lessonInstanceId: number,
  action: "yes" | "no"
  // PAD-124: the student answers the `waiting_list_offer` message they get when
  // the spot they wanted was just filled. "expired" mirrors PAD-68 — a class that
  // has already started can no longer take a waiting-list entry, so nothing is
  // recorded. "unknown" is the instance having no coach association.
): Promise<{ action: "added_to_waiting_list" | "declined" | "expired" | "unknown" }> {
  const res = await getApi().post("/app/notify/respond_waiting_list", { lessonInstanceId, action });
  return res.data;
}

export async function updateMessageTemplates(templates: Partial<MessageTemplates>): Promise<NotificationConfig> {
  const res = await getApi().post("/app/notify/config", { messageTemplates: templates });
  return res.data;
}

export async function getStandingWaitingList(): Promise<StandingWaitingListEntry[]> {
  const res = await getApi().get("/app/notify/standing_waiting_list");
  return res.data;
}

export async function addToStandingWaitingList(
  playerId: number,
  credits: number,
  durationDays: number,
): Promise<StandingWaitingListEntry> {
  const res = await getApi().post("/app/notify/standing_waiting_list", { playerId, credits, durationDays });
  return res.data;
}

export async function removeFromStandingWaitingList(entryId: number): Promise<void> {
  await getApi().delete(`/app/notify/standing_waiting_list/${entryId}`);
}

// ---------------------------------------------------------------------------
// PAD-196 — "Understand invites" (notifications.invite-simulation)
// ---------------------------------------------------------------------------

/**
 * Read-only dry run of the invitation engine for a hypothetical vacancy,
 * evaluated as of now. Nothing is sent, placed or created.
 */
export async function simulateInvites(req: InviteSimulationRequest): Promise<InviteSimulation> {
  const res = await getApi().post("/app/notify/invite_simulation", req);
  return res.data;
}

/** Why one roster player is, or is not, invited for that hypothetical vacancy. */
export async function explainInviteCandidate(
  req: InviteSimulationRequest & { playerId: string | number },
): Promise<InviteExplain> {
  const res = await getApi().post("/app/notify/invite_simulation/explain", req);
  return res.data;
}
