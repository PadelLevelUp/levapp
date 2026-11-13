/**
 * PAD-933 (owner decision 17; notifications.manual NM2, dashboard.blocks NA5): manual invites do
 * not go through the new engine yet, so on a new-engine class both shells offer no way into the
 * manual picker: no Notificar, no `notify=1` auto-open, no "Convidar" on the dashboard. A payload
 * without `engineVersion` comes from an older server and reads as `old`.
 */
export function manualInviteClosed(engineVersion: string | null | undefined): boolean {
  return engineVersion === "new";
}
