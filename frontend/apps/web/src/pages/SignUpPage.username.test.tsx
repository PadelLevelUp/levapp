/**
 * auth.register rule 21 (PAD-651, B-528): the username follows a suggestion from the name until the
 * user types in it, an email typed as the username gets its own message, and one account is sent
 * once — a double click or a click after the 201 never sends a second POST /api/auth/register.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const register = vi.fn();
const getMe = vi.fn();
const login = vi.fn();
vi.mock("@/api/auth", () => ({
  register: (...a: unknown[]) => register(...a),
  getMe: (...a: unknown[]) => getMe(...a),
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ login }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import SignUpPage from "./SignUpPage";

afterEach(() => sessionStorage.clear());

beforeAll(() => {
  // Radix's checkbox measures itself; jsdom has no ResizeObserver.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const set = (id: string, value: string) => fireEvent.change(input(id), { target: { value } });

function fill(username: string) {
  set("signup-name", "Jorge Torres");
  set("signup-username", username);
  set("signup-email", "jorge.torres@gmail.com");
  set("signup-password", "Segura123");
  set("signup-repeatPassword", "Segura123");
  set("signup-birthDate", "2000-01-01");
  fireEvent.click(screen.getByTestId("signup-terms"));
}

function mount() {
  return render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  register.mockReset();
  getMe.mockReset().mockResolvedValue({ id: 1, roles: ["student"], emailVerification: "verified" });
  login.mockReset().mockResolvedValue(undefined);
});

describe("SignUpPage — the username explains itself (PAD-651, auth.register rule 21)", () => {
  it("21a: the name pre-fills the username, until the user types in it", () => {
    mount();
    set("signup-name", "Jorge Torres");
    expect(input("signup-username").value).toBe("jorge.torres");
    set("signup-username", "JPT");
    set("signup-name", "Jorge P. Torres");
    expect(input("signup-username").value).toBe("JPT");
  });

  it("21b: an email typed as the username gets its own message, and nothing is sent", async () => {
    mount();
    fill("jorge.torres@gmail.com");
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-username-error")).toHaveTextContent("auth.signup.usernameIsEmail");
    expect(register).not.toHaveBeenCalled();
  });

  it("21c: a double click sends one sign-up", async () => {
    register.mockReturnValue(new Promise(() => {}));
    mount();
    fill("jpt");
    const submit = screen.getByTestId("signup-submit");
    act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
    });
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("21c: after the account exists, the button stays disabled and nothing is sent again", async () => {
    register.mockResolvedValue({ accessToken: "t" });
    mount();
    fill("jpt");
    fireEvent.click(screen.getByTestId("signup-submit"));
    await waitFor(() => expect(getMe).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("signup-submit")).toBeDisabled();
    fireEvent.click(screen.getByTestId("signup-submit"));
    await new Promise((r) => setTimeout(r, 20));
    expect(register).toHaveBeenCalledTimes(1);
  });
});
