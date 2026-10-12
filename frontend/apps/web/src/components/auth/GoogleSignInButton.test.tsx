/** auth.social-sign-in rule 7: the Google button ships dark and signs in through /auth/social. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const socialSignIn = vi.fn();
vi.mock("@/api/auth", () => ({ socialSignIn: (...a: unknown[]) => socialSignIn(...a) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

type Cb = (r: { credential: string }) => void;
let callback: Cb | null = null;
const renderButton = vi.fn();
const initialize = vi.fn((cfg: { callback: Cb }) => {
  callback = cfg.callback;
});

import { GoogleSignInButton } from "./GoogleSignInButton";

beforeEach(() => {
  callback = null;
  socialSignIn.mockReset();
  renderButton.mockReset();
  initialize.mockClear();
  // GIS already "loaded": loadGoogleIdentity resolves without injecting a script.
  (window as unknown as { google: unknown }).google = { accounts: { id: { initialize, renderButton } } };
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as unknown as { google?: unknown }).google;
});

describe("GoogleSignInButton", () => {
  it("renders nothing when VITE_GOOGLE_WEB_CLIENT_ID is unset", () => {
    vi.stubEnv("VITE_GOOGLE_WEB_CLIENT_ID", "");
    const { container } = render(<GoogleSignInButton onResult={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("google-sign-in")).toBeNull();
    expect(initialize).not.toHaveBeenCalled();
  });

  it("renders the container and asks Google to draw its button when configured", async () => {
    vi.stubEnv("VITE_GOOGLE_WEB_CLIENT_ID", "web-id.apps.googleusercontent.com");
    render(<GoogleSignInButton onResult={vi.fn()} />);
    expect(screen.getByTestId("google-sign-in")).toBeInTheDocument();
    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(initialize.mock.calls[0][0]).toMatchObject({
      client_id: "web-id.apps.googleusercontent.com",
      ux_mode: "popup",
    });
    expect(renderButton.mock.calls[0][1]).toMatchObject({ text: "continue_with" });
  });

  it("posts the credential and hands the answer to onResult", async () => {
    vi.stubEnv("VITE_GOOGLE_WEB_CLIENT_ID", "web-id");
    const answer = { needsProfile: true, signupTicket: "tk", name: "Rita", email: "r@x.pt" };
    socialSignIn.mockResolvedValue(answer);
    const onResult = vi.fn();
    render(<GoogleSignInButton onResult={onResult} />);
    await waitFor(() => expect(callback).not.toBeNull());
    await act(async () => callback!({ credential: "id-token" }));
    expect(socialSignIn).toHaveBeenCalledWith({ provider: "google", idToken: "id-token" });
    expect(onResult).toHaveBeenCalledWith(answer);
  });

  it.each([
    [401, undefined, "auth.social.errorInvalid"],
    [503, undefined, "auth.social.errorUnavailable"],
    // A Google-only account has no password: the refusals say what happened, not "use your password".
    [403, "COACH_REJECTED", "auth.social.errorCoachRejected"],
    [409, "ACCOUNT_EMAIL_UNVERIFIED", "auth.social.errorEmailUnverified"],
    [401, "ACCOUNT_DISABLED", "auth.social.errorDisabled"],
    [undefined, undefined, "auth.social.errorNetwork"],
  ])("shows an inline error for %s %s", async (status, code, key) => {
    vi.stubEnv("VITE_GOOGLE_WEB_CLIENT_ID", "web-id");
    socialSignIn.mockRejectedValue(status ? { response: { status, data: code ? { error: code } : {} } } : new Error("net"));
    const onResult = vi.fn();
    render(<GoogleSignInButton onResult={onResult} />);
    await waitFor(() => expect(callback).not.toBeNull());
    await act(async () => callback!({ credential: "x" }));
    expect(await screen.findByTestId("google-sign-in-error")).toHaveTextContent(key);
    expect(onResult).not.toHaveBeenCalled();
  });
});
