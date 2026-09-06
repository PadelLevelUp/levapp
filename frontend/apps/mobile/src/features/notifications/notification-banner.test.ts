import { describe, expect, it } from "vitest";

import { notificationBanner } from "./notification-banner";

describe("notificationBanner", () => {
  it("shows nothing once notifications are granted", () => {
    expect(notificationBanner({ status: "granted", canAskAgain: false })).toBe(
      "none"
    );
  });

  it("shows nothing before the permission state is known", () => {
    // The first render happens before getPermissionsAsync resolves; flashing a
    // banner and retracting it is worse than waiting a frame.
    expect(notificationBanner(null)).toBe("none");
    expect(notificationBanner(undefined)).toBe("none");
    expect(notificationBanner({ status: null })).toBe("none");
    expect(notificationBanner({ status: undefined })).toBe("none");
  });

  it("prompts when the OS has not been asked yet and still will ask", () => {
    expect(
      notificationBanner({ status: "undetermined", canAskAgain: true })
    ).toBe("prompt");
    // canAskAgain absent (older responses) reads as "we can still ask".
    expect(notificationBanner({ status: "undetermined" })).toBe("prompt");
  });

  it("calls it blocked when the user refused", () => {
    expect(notificationBanner({ status: "denied", canAskAgain: false })).toBe(
      "blocked"
    );
    expect(notificationBanner({ status: "denied", canAskAgain: true })).toBe(
      "blocked"
    );
  });

  it("calls it blocked when iOS will no longer show its own dialog", () => {
    // iOS asks exactly once. An "undetermined" the OS will not re-ask about is
    // functionally denied — an in-app Enable button would do nothing.
    expect(
      notificationBanner({ status: "undetermined", canAskAgain: false })
    ).toBe("blocked");
  });
});
