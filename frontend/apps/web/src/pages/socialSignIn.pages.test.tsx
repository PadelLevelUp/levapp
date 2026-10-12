/** auth.social-sign-in rules 3, 5, 7: both entry pages route a Google answer the way they route their own. */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const socialSignIn = vi.fn();
const getMe = vi.fn();
vi.mock("@/api/auth", () => ({
  socialSignIn: (...a: unknown[]) => socialSignIn(...a),
  getMe: () => getMe(),
  register: vi.fn(),
  reapplyCoachApproval: vi.fn(),
}));
vi.mock("@/api/client", () => ({ api: { post: vi.fn() } }));
const login = vi.fn();
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ login }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/brand/launch-overlay", () => ({
  useLaunchOverlay: () => ({ begin: vi.fn(), succeed: vi.fn(), cancel: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }),
}));
vi.mock("@/lib/googleIdentity", () => ({
  googleWebClientId: () => "web-id",
  loadGoogleIdentity: vi.fn(async () => {}),
  renderGoogleButton: (_el: unknown, o: { onCredential: (c: string) => void }) => {
    credential = o.onCredential;
  },
}));
let credential: ((c: string) => void) | null = null;

import AuthPage from "./AuthPage";
import SignUpPage from "./SignUpPage";

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname}|{JSON.stringify(l.state)}</div>;
}
function mount(page: "auth" | "signup") {
  return render(
    <MemoryRouter initialEntries={[page === "auth" ? "/auth" : "/signup"]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

beforeEach(() => {
  socialSignIn.mockReset();
  getMe.mockReset();
  login.mockReset();
  credential = null;
  sessionStorage.clear();
});

describe.each([["auth"], ["signup"]] as const)("%s page with Google", (page) => {
  it("signs in through the page's existing path on a login answer", async () => {
    socialSignIn.mockResolvedValue({ accessToken: "tok", user: { id: 1, name: "A", role: "coach" } });
    getMe.mockResolvedValue({ id: 1, roles: ["coach"], coachApproval: "approved", clubs: [{ id: 1, name: "C" }] });
    mount(page);
    await waitFor(() => expect(credential).not.toBeNull());
    await act(async () => credential!("id-token"));
    await waitFor(() => expect(login).toHaveBeenCalledWith("tok"));
    expect((await screen.findByTestId("where")).textContent).toMatch(/^\/dashboard/);
  });

  it("honours a remembered post-auth redirect (join link)", async () => {
    sessionStorage.setItem("postAuthRedirect", "/join/abc");
    socialSignIn.mockResolvedValue({ accessToken: "tok", user: { id: 1, name: "A", role: "player" } });
    getMe.mockResolvedValue({ id: 1, roles: ["player"], coaches: [] });
    mount(page);
    await waitFor(() => expect(credential).not.toBeNull());
    await act(async () => credential!("id-token"));
    expect((await screen.findByTestId("where")).textContent).toMatch(/^\/join\/abc/);
  });

  it("sends a needsProfile answer to /signup/complete with the ticket in router state", async () => {
    socialSignIn.mockResolvedValue({ needsProfile: true, signupTicket: "tk", name: "Rita", email: "r@x.pt" });
    mount(page);
    await waitFor(() => expect(credential).not.toBeNull());
    await act(async () => credential!("id-token"));
    const where = (await screen.findByTestId("where")).textContent!;
    expect(where.startsWith("/signup/complete|")).toBe(true);
    expect(JSON.parse(where.split("|")[1])).toEqual({ signupTicket: "tk", name: "Rita", email: "r@x.pt" });
    expect(login).not.toHaveBeenCalled();
  });
});
