/**
 * PAD-716 (auth.logout rule 6, B-601): the query cache keeps server answers fresh for 60 s, and the
 * web signs out without a reload, so the next account in the same tab must not be served the
 * previous one's cached profile, conversations or players. Sign-out and sign-in both clear it.
 */
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const getMe = vi.fn(async () => ({ id: 2, role: "coach", language: "en" }));
vi.mock("@/api/auth", () => ({ getMe: () => getMe() }));
vi.mock("@/api/client", () => ({ api: { post: vi.fn(async () => undefined) } }));
vi.mock("@/config", () => ({ USE_MOCK_DATA: false }));
vi.mock("@/utils/pushNotifications", () => ({ requestAndSubscribe: vi.fn() }));
vi.mock("@/utils/pushFailureReport", () => ({ startPushFailureReport: () => () => undefined }));
vi.mock("@/i18n", () => ({ default: { changeLanguage: vi.fn(), language: "en" } }));

import { AuthProvider, useAuth } from "./AuthContext";

function mount() {
  const qc = new QueryClient();
  qc.setQueryData(["auth-me"], { id: 1, role: "player" });
  qc.setQueryData(["conversations"], [{ id: 9, participantName: "Student's coach" }]);
  let auth!: ReturnType<typeof useAuth>;
  function Probe() {
    auth = useAuth();
    return null;
  }
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { qc, auth: () => auth };
}

describe("a session's cached data ends with it (PAD-716)", () => {
  it("logout empties the query cache", () => {
    const { qc, auth } = mount();
    act(() => auth().logout());
    expect(qc.getQueryData(["auth-me"])).toBeUndefined();
    expect(qc.getQueryData(["conversations"])).toBeUndefined();
  });

  it("signing in as someone else starts from an empty cache", async () => {
    const { qc, auth } = mount();
    let cachedWhenReadingMe: unknown = "not read";
    getMe.mockImplementationOnce(async () => {
      cachedWhenReadingMe = qc.getQueryData(["auth-me"]);
      return { id: 2, role: "coach", language: "en" };
    });
    await act(async () => auth().login("coach-token"));
    expect(cachedWhenReadingMe).toBeUndefined();
    expect(qc.getQueryData(["conversations"])).toBeUndefined();
  });
});
