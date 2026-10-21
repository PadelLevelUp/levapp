/** auth.social-sign-in rule 4/7: the completion step for a person with no account yet. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const completeSocialSignUp = vi.fn();
const getMe = vi.fn();
vi.mock("@/api/auth", () => ({
  completeSocialSignUp: (...a: unknown[]) => completeSocialSignUp(...a),
  getMe: () => getMe(),
}));
const login = vi.fn();
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ login }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }),
}));

import SocialSignUpCompletePage from "./SocialSignUpCompletePage";

const pad = (n: number) => String(n).padStart(2, "0");
function yearsAgo(years: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}</div>;
}
const STATE = { signupTicket: "tk", name: "Rita Silva", email: "rita@example.com" };
function mount(state: unknown = STATE) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/signup/complete", state }]}>
      <Routes>
        <Route path="/signup/complete" element={<SocialSignUpCompletePage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}
function fill(birth: string, terms = true) {
  fireEvent.change(screen.getByTestId("social-complete-birthDate"), { target: { value: birth } });
  if (terms) fireEvent.click(screen.getByTestId("social-complete-terms"));
}

beforeEach(() => {
  completeSocialSignUp.mockReset();
  getMe.mockReset();
  login.mockReset();
  sessionStorage.clear();
});

describe("SocialSignUpCompletePage", () => {
  it("shows the provider's name and email read-only", () => {
    mount();
    expect(screen.getByTestId("social-complete")).toBeInTheDocument();
    expect(screen.getByText("Rita Silva")).toBeInTheDocument();
    expect(screen.getByText("rita@example.com")).toBeInTheDocument();
  });

  it("refuses an under-18 date and a missing Terms box without a request", async () => {
    mount();
    fill(yearsAgo(17), false);
    fireEvent.click(screen.getByTestId("social-complete-submit"));
    expect(await screen.findByTestId("social-complete-birthDate-error")).toHaveTextContent("auth.signup.birthDateUnderage");
    expect(screen.getByTestId("social-complete-terms-error")).toHaveTextContent("auth.signup.termsRequired");
    expect(completeSocialSignUp).not.toHaveBeenCalled();
  });

  it("maps a server 400 to its field", async () => {
    completeSocialSignUp.mockRejectedValue({
      response: { status: 400, data: { error: "x", field: "birthDate", code: "UNDERAGE" } },
    });
    mount();
    fill(yearsAgo(30));
    fireEvent.click(screen.getByTestId("social-complete-submit"));
    expect(await screen.findByTestId("social-complete-birthDate-error")).toHaveTextContent("auth.signup.birthDateUnderage");
  });

  it("explains an expired ticket and links back to /signup", async () => {
    completeSocialSignUp.mockRejectedValue({ response: { status: 401, data: { error: "INVALID_SIGNUP_TICKET" } } });
    mount();
    fill(yearsAgo(30));
    fireEvent.click(screen.getByTestId("social-complete-submit"));
    expect(await screen.findByTestId("social-complete-expired")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/signup");
  });

  it("shows the same message when opened without router state", () => {
    mount(null);
    expect(screen.getByTestId("social-complete-expired")).toBeInTheDocument();
  });

  it("signs in and follows the post-sign-in path on success", async () => {
    completeSocialSignUp.mockResolvedValue({ accessToken: "tok", user: { id: 2, name: "Rita", role: "player" } });
    getMe.mockResolvedValue({ id: 2, roles: ["player"], coaches: [] });
    mount();
    fireEvent.click(screen.getByTestId("social-complete-role-student"));
    fill(yearsAgo(30));
    fireEvent.click(screen.getByTestId("social-complete-submit"));
    await waitFor(() =>
      expect(completeSocialSignUp).toHaveBeenCalledWith({
        signupTicket: "tk",
        role: "student",
        birthDate: yearsAgo(30),
        country: "PT",
        termsAccepted: true,
      }),
    );
    await waitFor(() => expect(login).toHaveBeenCalledWith("tok"));
    expect((await screen.findByTestId("where")).textContent).toBe("/connect");
  });
});
