/**
 * PAD-482 (auth.email-verification rule 14): a coach with no email is asked for one on the coach home.
 * Asserted by test id and translation key (t returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { emailPromptSession } from "@levelup/config";
import type { MeResponse } from "@/api/auth";
import { EmailPromptBanner } from "./EmailPromptBanner";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const me = (over: Partial<MeResponse>): MeResponse =>
  ({ id: 7, username: "rui", name: "Rui", roles: ["coach"], coachId: "3", isSuperAdmin: false, email: null, ...over }) as MeResponse;

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function mount(user: MeResponse) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<EmailPromptBanner user={user} />} />
        <Route path="/settings" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => emailPromptSession.reset());

describe("EmailPromptBanner (rule 14, PAD-482)", () => {
  it("asks a coach with no email", () => {
    mount(me({ email: null }));
    expect(screen.getByTestId("email-prompt")).toHaveTextContent("dashboard.emailPrompt.text");
  });

  it("never shows for a coach with an email, or for a player", () => {
    const { unmount } = mount(me({ email: "rui@example.com" }));
    expect(screen.queryByTestId("email-prompt")).toBeNull();
    unmount();
    mount(me({ roles: ["player"], email: null }));
    expect(screen.queryByTestId("email-prompt")).toBeNull();
  });

  it("Adicionar email opens Settings → Perfil on the email field", () => {
    mount(me({ email: null }));
    fireEvent.click(screen.getByTestId("email-prompt-add"));
    expect(screen.getByTestId("where")).toHaveTextContent("/settings?tab=profile&focus=email");
  });

  it("Agora não hides it for the session: a remount keeps it hidden, a sign-out brings it back", () => {
    const { unmount } = mount(me({ email: null }));
    fireEvent.click(screen.getByTestId("email-prompt-dismiss"));
    expect(screen.queryByTestId("email-prompt")).toBeNull();
    unmount();

    const again = mount(me({ email: null }));
    expect(screen.queryByTestId("email-prompt")).toBeNull();
    again.unmount();

    emailPromptSession.reset(); // what logout does
    mount(me({ email: null }));
    expect(screen.getByTestId("email-prompt")).toBeInTheDocument();
  });
});
