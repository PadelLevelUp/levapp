import type {
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

export async function updateNotificationConfig(
  data: Partial<NotificationConfig>
): Promise<NotificationConfig> {
  const res = await getApi().post("/app/notify/config", data);
  return res.data;
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
): Promise<{ action: "confirmed" | "declined" | "spot_filled" | "unknown" }> {
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

export async function cancelAttendance(
  lessonInstanceId: number
  // PAD-73: `proactive` is the SERVER's classification — true when the decline
  // landed before the instant this student's attendance reminder would have
  // fired. The client never derives this cutoff itself.
): Promise<{ action: "declined"; proactive?: boolean }> {
  const res = await getApi().post("/app/notify/cancel_attendance", { lessonInstanceId });
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
