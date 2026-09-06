import type { CoachPlayer } from "@levelup/types";

/**
 * The coach-facing read of a student's own notification opt-outs (PAD-112,
 * ported to iOS by PAD-165).
 *
 * `notifications.student-block-preferences` rule 11: the student's record
 * shows a "notifications cut" signal whenever `notificationsBlocked` is true,
 * together with which levels are blocked and the reason they gave. The reason
 * is deliberately coach-visible and read-only here — it is written only from
 * the student's own Settings.
 *
 * Kept as a pure function rather than inlined in the screen because screens
 * are not unit-testable in this workspace (no Metro, no renderer): this is the
 * part of the behaviour that can actually be pinned by a test.
 */

/** What the coach sees, as i18n key paths — the caller does the `t()`. */
export interface NotificationBlockSummary {
  /** Whether to show the badge and the breakdown at all. */
  blocked: boolean;
  /**
   * The blocked levels, in web's `PlayerInfoCard` order (all → auto → manual).
   * Empty when nothing is blocked — and possible even when `blocked` is true,
   * if a payload carries the derived flag without the three booleans.
   */
  levelKeys: string[];
  /**
   * The student's stated reason, trimmed. `null` when they gave none, which
   * the caller renders as `players.notificationsBlockedNoReason`.
   */
  reason: string | null;
}

export const NOTIFICATION_BLOCK_LEVEL_KEYS = {
  all: "players.notificationsBlockedAll",
  auto: "players.notificationsBlockedAuto",
  manual: "players.notificationsBlockedManual",
} as const;

type BlockFields = Pick<
  CoachPlayer,
  | "notificationsBlocked"
  | "blockAllNotifications"
  | "blockAutoInvitations"
  | "blockManualInvitations"
  | "notificationBlockReason"
>;

export function summarizeNotificationBlock(
  player: Partial<BlockFields> | null | undefined
): NotificationBlockSummary {
  // `notificationsBlocked` is derived server-side from the three flags
  // (student-block-preferences rule 10), so it is the single gate — exactly as
  // apps/web reads it. A payload from an older backend omits the field
  // entirely, and "absent" means "not blocked".
  const blocked = Boolean(player?.notificationsBlocked);
  if (!blocked) return { blocked: false, levelKeys: [], reason: null };

  const levelKeys: string[] = [];
  if (player?.blockAllNotifications) levelKeys.push(NOTIFICATION_BLOCK_LEVEL_KEYS.all);
  if (player?.blockAutoInvitations) levelKeys.push(NOTIFICATION_BLOCK_LEVEL_KEYS.auto);
  if (player?.blockManualInvitations) levelKeys.push(NOTIFICATION_BLOCK_LEVEL_KEYS.manual);

  const reason = player?.notificationBlockReason?.trim();
  return { blocked: true, levelKeys, reason: reason ? reason : null };
}
