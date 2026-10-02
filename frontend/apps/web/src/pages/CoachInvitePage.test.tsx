/**
 * clubs.coach-invitation rule 9 (PAD-477): the web accept form asks for an email, sends it, maps
 * the server's email refusals onto the field, and a pending account lands on Verify your email.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const accept = vi.fn();
const getMe = vi.fn();
const navigate = vi.fn();
vi.mock("@/api/invitations", () => ({
  getCoachInvitation: vi.fn().mockResolvedValue({ clubName: "Clube Teste" }),
  acceptCoachInvitation: (...a: unknown[]) => accept(...a),
}));
vi.mock("@/api/auth", () => ({ getMe: (...a: unknown[]) => getMe(...a) }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ login: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

import CoachInvitePage from "./CoachInvitePage";

async function mount() {
  render(
    <MemoryRouter initialEntries={["/invite/coach/tok123"]}>
      <Routes>
        <Route path="/invite/coach/:token" element={<CoachInvitePage />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByLabelText("auth.coachInvite.email");
}

function fill(email: string) {
  const set = (id: string, value: string) =>
    fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
  set("name", "Rita Coach");
  set("username", "rita_coach");
  set("email", email);
  set("password", "Secret123!");
  set("repeatPassword", "Secret123!");
  set("birthDate", "1990-01-01");
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "auth.coachInvite.join" }));

beforeEach(() => {
  accept.mockReset();
  getMe.mockReset();
  navigate.mockReset();
});

describe("CoachInvitePage — the invited coach's email (PAD-477, rule 9)", () => {
  it("sends the email it was given", async () => {
    accept.mockResolvedValue({ accessToken: "t" });
    getMe.mockResolvedValue({ emailVerification: "pending" });
    await mount();
    fill("  Rita@Example.com ");
    submit();
    await waitFor(() => expect(accept).toHaveBeenCalledTimes(1));
    expect(accept.mock.calls[0][1]).toMatchObject({ email: "Rita@Example.com" });
  });

  it("a pending account goes to Verify your email", async () => {
    accept.mockResolvedValue({ accessToken: "t" });
    getMe.mockResolvedValue({ emailVerification: "pending" });
    await mount();
    fill("rita@example.com");
    submit();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(navigate.mock.calls.at(-1)?.[0]).toMatch(/^\/verify-email\?next=/);
  });

  it("refuses an empty or malformed email on the field and sends nothing", async () => {
    await mount();
    fill("not-an-address");
    submit();
    expect(await screen.findByTestId("coachInvite-email-error")).toHaveTextContent("auth.coachInvite.emailInvalid");
    expect(accept).not.toHaveBeenCalled();
  });

  it("puts a server 409 on the email field", async () => {
    accept.mockRejectedValue({ response: { status: 409, data: { field: "email" } } });
    await mount();
    fill("taken@example.com");
    submit();
    expect(await screen.findByTestId("coachInvite-email-error")).toHaveTextContent("auth.coachInvite.emailTaken");
  });
});
