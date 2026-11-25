/**
 * PAD-753 (auth.logout rule 4): web sign-out names this browser's push subscription, with the token of
 * the session it ends. The API client is the real one: it reads the token when a request leaves, after
 * the sign-out has removed it, so a sign-out sent through it would go out with none.
 */
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

vi.mock("@/api/auth", () => ({ getMe: vi.fn(() => new Promise(() => undefined)) }));
vi.mock("@/config", () => ({ USE_MOCK_DATA: false }));
vi.mock("@/utils/pushFailureReport", () => ({ startPushFailureReport: () => () => undefined }));
vi.mock("@/i18n", () => ({ default: { changeLanguage: vi.fn(), language: "en" } }));

import { AuthProvider, useAuth } from "./AuthContext";
import { ENDPOINT_WAIT_MS } from "./signOutRequest";

const ENDPOINT = "https://push.example.com/this-browser";

function mount() {
  let logout!: () => void;
  function Probe() {
    logout = useAuth().logout;
    return null;
  }
  render(<AuthProvider><Probe /></AuthProvider>);
  return { logout: () => act(() => logout()) };
}

describe("web sign-out and this browser's push subscription", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let getSubscription: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.setItem("accessToken", "session-token");
    getSubscription = vi.fn().mockResolvedValue({ endpoint: ENDPOINT });
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue({ pushManager: { getSubscription } }) },
    });
    fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const signOuts = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/logout"));
  const bodyOf = ([, init]: unknown[]) => JSON.parse(String((init as RequestInit).body));

  it("[AUTH-LOGOUT-10] sign-out sends the browser endpoint with the token", async () => {
    mount().logout();
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(signOuts()).toHaveLength(0);
    await vi.waitFor(() => expect(signOuts()).toHaveLength(1));
    const [url, init] = signOuts()[0];
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer session-token" } });
    expect(bodyOf([url, init])).toEqual({ pushEndpoint: ENDPOINT });
    // Production's API is another origin, so this request is preflighted: no `keepalive`, which some engines refuse there.
    expect(init).not.toHaveProperty("keepalive");
  });

  it("[AUTH-LOGOUT-10] a browser with no subscription sends none", async () => {
    getSubscription.mockResolvedValue(null);
    mount().logout();
    await vi.waitFor(() => expect(signOuts()).toHaveLength(1));
    expect(bodyOf(signOuts()[0])).toEqual({});
  });

  it("[AUTH-LOGOUT-10] a subscription that cannot be read never holds the sign-out back", async () => {
    getSubscription.mockRejectedValue(new Error("no"));
    mount().logout();
    await vi.waitFor(() => expect(signOuts()).toHaveLength(1));
    expect(bodyOf(signOuts()[0])).toEqual({});

    vi.useFakeTimers();
    localStorage.setItem("accessToken", "second-token");
    getSubscription.mockReturnValue(new Promise(() => undefined));
    mount().logout();
    await vi.advanceTimersByTimeAsync(ENDPOINT_WAIT_MS);
    expect(signOuts()).toHaveLength(2);
    expect(signOuts()[1][1]).toMatchObject({ headers: { Authorization: "Bearer second-token" } });
    expect(bodyOf(signOuts()[1])).toEqual({});
  });
});
