import { api } from "@/api/client";
import type { NotificationConfig, NotificationEventItem, StudentGroup, MessageTemplates } from "@/types";

export async function getNotificationConfig(): Promise<NotificationConfig> {
  const res = await api.get("/app/notify/config");
  return res.data;
}

export async function updateNotificationConfig(
  data: Partial<NotificationConfig>
): Promise<NotificationConfig> {
  const res = await api.post("/app/notify/config", data);
  return res.data;
}

export async function toggleLessonNotifications(
  model: string,
  originalId: string,
  date: string
): Promise<{ notificationsEnabled: boolean }> {
  const res = await api.post("/app/notify/toggle_class", { model, originalId, date });
  return res.data;
}

export async function sendManualNotifications(
  model: string,
  originalId: string,
  date: string,
  playerIds: string[]
): Promise<{ sent: number }> {
  const res = await api.post("/app/notify/manual", { model, originalId, date, playerIds });
  return res.data;
}

export async function getNotificationActivity(): Promise<NotificationEventItem[]> {
  const res = await api.get("/app/notify/activity");
  return res.data;
}

export async function getNotificationGroups(
  model: string,
  originalId: string,
  date: string
): Promise<StudentGroup[]> {
  const res = await api.get("/app/notify/groups", {
    params: { model, originalId, date },
  });
  return res.data;
}

export async function respondToNotification(
  notificationEventId: number,
  action: "yes" | "no"
): Promise<{ action: "confirmed" | "declined" | "spot_filled" | "unknown" }> {
  const res = await api.post("/app/notify/respond", { notificationEventId, action });
  return res.data;
}

export async function updateMessageTemplates(templates: Partial<MessageTemplates>): Promise<NotificationConfig> {
  const res = await api.post("/app/notify/config", { messageTemplates: templates });
  return res.data;
}
