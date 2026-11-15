/**
 * PAD-838 (notifications.groups rule 7): the manual-invite groups (`notification_groups`) are
 * per-coach data, seeded in English from the backend's `DEFAULT_NOTIFICATION_GROUPS`
 * (`backend/padel_app/models/notification_config.py`, also `services/coach_service.py`). A label
 * that is still its id's seeded default is shown in the reader's language; any other label is the
 * coach's own and is shown as stored. Stored data is never rewritten.
 */
export const DEFAULT_NOTIFICATION_GROUP_LABELS: Readonly<Record<string, string>> = {
  same_level: "Same level",
  recent_absences: "Recent absences",
  justified_absences: "Justified absences",
  all_students: "All students",
};

const LABEL_KEYS: Readonly<Record<string, string>> = {
  same_level: "settings.notificationGroups.labels.sameLevel",
  recent_absences: "settings.notificationGroups.labels.recentAbsences",
  justified_absences: "settings.notificationGroups.labels.justifiedAbsences",
  all_students: "settings.notificationGroups.labels.allStudents",
};

/** The translation key for a group still carrying its default label; null for the coach's own. */
export function notificationGroupLabelKey(group: { id: string; label: string }): string | null {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_NOTIFICATION_GROUP_LABELS, group.id)) return null;
  return DEFAULT_NOTIFICATION_GROUP_LABELS[group.id] === group.label ? LABEL_KEYS[group.id] : null;
}

/** The label to show: the reader's language for a default label, the stored label otherwise. */
export function notificationGroupLabel(
  group: { id: string; label: string },
  t: (key: string) => string
): string {
  const key = notificationGroupLabelKey(group);
  return key ? t(key) : group.label;
}
