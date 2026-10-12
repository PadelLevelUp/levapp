/**
 * PAD-630 — auth.login rule 13, the web prompt: shown to a signed-in user whose country is null,
 * never to one with a country, a held one, or one who said "Agora não" in the last 30 days.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import "@/i18n";
import { COUNTRY_PROMPT_STORAGE_KEY } from "@levelup/config";

type TestUser = { id: number; roles: string[]; country?: string | null; emailVerification?: string; coachApproval?: string; clubs?: unknown[] };
const auth = vi.hoisted(() => ({
  user: null as null | TestUser,
  refreshUser: vi.fn(async () => null),
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: auth.user, refreshUser: auth.refreshUser }) }));
const updateMe = vi.hoisted(() => vi.fn());
vi.mock("@/api/auth", () => ({ updateMe }));

import { CountryPrompt } from "./CountryPrompt";

beforeEach(() => {
  localStorage.clear();
  auth.user = { id: 7, roles: ["player"], country: null };
  auth.refreshUser.mockClear();
  updateMe.mockReset();
  updateMe.mockResolvedValue({ id: 7, country: "PT" });
});
afterEach(() => localStorage.clear());

describe("the country prompt", () => {
  it("shows for a user whose country is null, with PT selected", () => {
    render(<CountryPrompt />);
    expect(screen.getByTestId("country-prompt")).toBeTruthy();
    expect(screen.getByTestId("country-prompt-select")).toHaveTextContent("Portugal");
  });

  it("not for a set country, nobody, a held user or a dismissed device", () => {
    auth.user = { id: 7, roles: ["player"], country: "ES" };
    const a = render(<CountryPrompt />);
    expect(screen.queryByTestId("country-prompt")).toBeNull();
    a.unmount();

    auth.user = null;
    const b = render(<CountryPrompt />);
    expect(screen.queryByTestId("country-prompt")).toBeNull();
    b.unmount();

    auth.user = { id: 7, roles: ["player"], country: null, emailVerification: "pending" };
    const c = render(<CountryPrompt />);
    expect(screen.queryByTestId("country-prompt")).toBeNull();
    c.unmount();

    auth.user = { id: 7, roles: ["coach"], country: null, coachApproval: "pending", clubs: [] };
    const d = render(<CountryPrompt />);
    expect(screen.queryByTestId("country-prompt")).toBeNull();
    d.unmount();

    auth.user = { id: 7, roles: ["player"], country: null };
    localStorage.setItem(COUNTRY_PROMPT_STORAGE_KEY, String(Date.now() - 1000));
    render(<CountryPrompt />);
    expect(screen.queryByTestId("country-prompt")).toBeNull();
  });

  it("Guardar sends {country: PT} and refreshes the signed-in user", async () => {
    render(<CountryPrompt />);
    fireEvent.click(screen.getByTestId("country-prompt-save"));
    await waitFor(() => expect(updateMe).toHaveBeenCalledWith({ country: "PT" }));
    await waitFor(() => expect(auth.refreshUser).toHaveBeenCalledTimes(1));
  });

  it("Agora não hides it and remembers for 30 days", () => {
    render(<CountryPrompt />);
    fireEvent.click(screen.getByTestId("country-prompt-later"));
    expect(screen.queryByTestId("country-prompt")).toBeNull();
    const at = Number(localStorage.getItem(COUNTRY_PROMPT_STORAGE_KEY));
    expect(Date.now() - at).toBeLessThan(5000);
    expect(updateMe).not.toHaveBeenCalled();
  });

  it("a failed save shows an inline error and keeps the prompt", async () => {
    updateMe.mockRejectedValue(new Error("400"));
    render(<CountryPrompt />);
    fireEvent.click(screen.getByTestId("country-prompt-save"));
    expect(await screen.findByTestId("country-prompt-error")).toBeTruthy();
    expect(screen.getByTestId("country-prompt")).toBeTruthy();
    expect(auth.refreshUser).not.toHaveBeenCalled();
  });
});
