/**
 * notifications.notification-sound rule 4 (PAD-680): whether a push that arrives while the app is
 * open plays the system sound — the signed-in user's switch, set from `/auth/me` (the tabs layout)
 * and after each Settings save. Kept apart from the notification handler so screens can set it
 * without importing expo-notifications.
 */
let foregroundSound = true;

export function setForegroundSound(enabled: boolean): void {
  foregroundSound = enabled;
}

export function foregroundSoundEnabled(): boolean {
  return foregroundSound;
}

/** The handler's answer for a push that arrives while the app is open. */
export function foregroundPresentation() {
  return {
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: foregroundSound,
    shouldSetBadge: false,
  };
}
