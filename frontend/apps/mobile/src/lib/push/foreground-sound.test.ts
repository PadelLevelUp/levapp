import { afterEach, describe, expect, it } from "vitest";

import { foregroundPresentation, setForegroundSound } from "./foreground-sound";

describe("notifications.notification-sound rule 4: iOS foreground sound", () => {
  afterEach(() => setForegroundSound(true));

  it("[NOTIFICATIONS-NOTIFICATION-SOUND-3] plays the system sound when the user's switch is on (the default)", () => {
    expect(foregroundPresentation()).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it("[NOTIFICATIONS-NOTIFICATION-SOUND-3] stays silent, still showing the banner, when it is off", () => {
    setForegroundSound(false);
    expect(foregroundPresentation()).toMatchObject({ shouldShowBanner: true, shouldPlaySound: false });
  });
});
