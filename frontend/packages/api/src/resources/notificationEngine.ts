import type {
  ApprovalAction,
  ApprovalVacancyResult,
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

export async function sendClassReminders(
  model: string,
  originalId: string,
  date: string
): Promise<{ sent: number }> {
  const res = await getApi().post("/app/notify/send_reminders", { model, originalId, date });
  return res.data;
}

export async function sendManualNotifications(
  model: string,
  originalId: string,
  date: string,
  playerIds: string[]
): Promise<{ sent: number }> {
  const res = await getApi().post("/app/notify/manual", { model, originalId, date, playerIds });
  return res.data;
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
): Promise<{ action: "confirmed" | "declined" }> {
  const res = await getApi().post("/app/notify/respond_reminder", { lessonInstanceId, action });
  return res.data;
}

export async function cancelAttendance(
  lessonInstanceId: number
): Promise<{ action: "declined" }> {
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
