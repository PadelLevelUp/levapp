/**
 * players.invite-completion rule 10a (PAD-604): the web completion form asks for the country
 * (default PT), sends it, and puts a server COUNTRY_REQUIRED on the field.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const accept = vi.fn();
vi.mock("@/api/playerInvitations", () => ({
  getPlayerInvitation: vi.fn().mockResolvedValue({ playerName: "Ana" }),
  acceptPlayerInvitation: (...a: unknown[]) => accept(...a),
  claimPlayerInvitation: vi.fn(),
}));
vi.mock("@/auth/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn().mockResolvedValue(undefined), user: null, isAuthenticated: false, loading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import PlayerInvitePage from "./PlayerInvitePage";

async function mount() {
  render(
    <MemoryRouter initialEntries={["/invite/player/tok123"]}>
      <Routes>
        <Route path="/invite/player/:token" element={<PlayerInvitePage />} />
        <Route path="/" element={<p>home</p>} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByLabelText("auth.playerInvite.birthDate");
  const set = (id: string, value: string) =>
    fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
  set("username", "ana_player");
  set("password", "Secret123!");
  set("repeatPassword", "Secret123!");
  set("birthDate", "1990-01-01");
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "auth.playerInvite.complete" }));

beforeEach(() => {
  accept.mockReset();
});

describe("PlayerInvitePage — the country (PAD-604, rule 10a)", () => {
  it("shows the country field defaulted to Portugal and sends PT", async () => {
    accept.mockResolvedValue({ accessToken: "t" });
    await mount();
    expect(screen.getByTestId("playerInvite-country")).toHaveTextContent("Portugal");
    submit();
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept.mock.calls[0][1]).toMatchObject({ country: "PT" });
  });

  it.each(["COUNTRY_REQUIRED", "INVALID_COUNTRY"])("puts a server %s on the country field", async (code) => {
    accept.mockRejectedValue({ response: { status: 400, data: { field: "country", code } } });
    await mount();
    submit();
    expect(await screen.findByTestId("playerInvite-country-error")).toHaveTextContent("auth.playerInvite.countryRequired");
  });
});
