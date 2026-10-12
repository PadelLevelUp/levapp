/**
 * client.route-loading rule 6 (PAD-585): the session restore waits for the user's language, and a
 * language that fails to load keeps the current one instead of blocking the session.
 */
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const i18nMock = vi.hoisted(() => ({ changeLanguage: vi.fn(), language: "pt" }));
vi.mock("@/api/auth", () => ({ getMe: vi.fn(async () => ({ id: 7, username: "e2e-coach", language: "en" })) }));
vi.mock("@/api/client", () => ({ api: { post: vi.fn(async () => undefined) } }));
vi.mock("@/config", () => ({ USE_MOCK_DATA: false }));
vi.mock("@/utils/pushNotifications", () => ({ requestAndSubscribe: vi.fn() }));
vi.mock("@/i18n", () => ({ default: i18nMock }));

import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { loading, user } = useAuth();
  return <p data-testid="state">{loading ? "loading" : `ready:${user?.username ?? "none"}`}</p>;
}

describe("session restore and the user's language", () => {
  beforeEach(() => {
    window.localStorage.setItem("accessToken", "tok");
    i18nMock.changeLanguage.mockReset();
  });

  it("stays loading until the language has arrived", async () => {
    let arrive!: () => void;
    i18nMock.changeLanguage.mockImplementation(() => new Promise<void>((resolve) => (arrive = resolve)));
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(i18nMock.changeLanguage).toHaveBeenCalledWith("en"));
    expect(screen.getByTestId("state").textContent).toBe("loading");

    arrive();
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("ready:e2e-coach"));
  });

  it("restores the session when the language fails to load", async () => {
    i18nMock.changeLanguage.mockRejectedValue(new Error("Failed to fetch dynamically imported module"));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("ready:e2e-coach"));
  });
});
