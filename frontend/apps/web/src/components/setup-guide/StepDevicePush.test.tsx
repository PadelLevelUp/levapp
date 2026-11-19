/** dashboard.student-setup-guide rule 7 (PAD-839): step 2 on web. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: vi.fn() }));

import { StepDevicePush } from "@/pages/SetupGuidePage";
import { makeGuide, userEvent } from "./guide-fixture";

afterEach(() => vi.unstubAllGlobals());

describe("StepDevicePush", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-8] opening step 2 prompts nothing, and the button subscribes", async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    const guide = makeGuide({ device: "ask" });
    const onDone = vi.fn();
    render(<StepDevicePush guide={guide} onDone={onDone} onLeave={() => {}} />);

    expect(requestPermission).not.toHaveBeenCalled();
    expect(guide.subscribe).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByTestId("setup-device-allow"));
    expect(guide.subscribe).toHaveBeenCalledTimes(1);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("[DASHBOARD-STUDENT-SETUP-GUIDE-23] padlock help re-checks, and iPhone Safari shows the App Store link", async () => {
    const user = userEvent.setup();

    // Denied: the padlock help; "Já mudei, verificar" reads the permission again (subscribe).
    const denied = makeGuide({ device: "padlock" });
    denied.subscribe.mockResolvedValue(true);
    const onDone = vi.fn();
    const first = render(<StepDevicePush guide={denied} onDone={onDone} onLeave={() => {}} />);
    expect(screen.getByTestId("setup-device-padlock")).toBeTruthy();
    await user.click(screen.getByTestId("setup-device-recheck"));
    expect(denied.subscribe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    first.unmount();

    // iPhone Safari outside the app: the App Store link, and the step can never finish.
    const ios = makeGuide({ device: "ios_browser" });
    const iosDone = vi.fn();
    render(<StepDevicePush guide={ios} onDone={iosDone} onLeave={() => {}} />);
    const link = screen.getByTestId("setup-device-app-store");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toMatch(/^https:\/\/apps\.apple\.com\//);
    expect(screen.queryByTestId("setup-device-allow")).toBeNull();
    expect(screen.queryByTestId("setup-device-recheck")).toBeNull();
    expect(ios.subscribe).not.toHaveBeenCalled();
    expect(iosDone).not.toHaveBeenCalled();
  });
});
