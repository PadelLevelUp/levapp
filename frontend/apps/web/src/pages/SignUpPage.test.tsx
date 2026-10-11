/**
 * auth.register rule 18 (PAD-445): the web form refuses anyone under 18 on the birth-date field
 * before any request, maps a server `UNDERAGE` to the same message, and never asks for a
 * guardian's email any more.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const register = vi.fn();
vi.mock("@/api/auth", () => ({
  register: (...a: unknown[]) => register(...a),
  getMe: vi.fn(),
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import SignUpPage from "./SignUpPage";

// PAD-575 (auth.register rule 20): the page keeps a draft of the form in sessionStorage; each case
// starts from a blank tab, or a Terms box ticked in one case is restored in the next.
afterEach(() => sessionStorage.clear());

const pad = (n: number) => String(n).padStart(2, "0");
/** A local date `years` years ago, shifted by `days`. */
function yearsAgo(years: number, days = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

beforeAll(() => {
  // Radix's checkbox measures itself; jsdom has no ResizeObserver.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

/** Fills the form; the Terms box is ticked unless `terms: false` (auth.register rule 19, PAD-485). */
function fill(birthDate: string, { terms = true }: { terms?: boolean } = {}) {
  const set = (id: string, value: string) =>
    fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
  set("signup-name", "Teen Silva");
  set("signup-username", "teen");
  set("signup-email", "teen@example.com");
  set("signup-password", "Segura123");
  set("signup-repeatPassword", "Segura123");
  set("signup-birthDate", birthDate);
  if (terms) fireEvent.click(screen.getByTestId("signup-terms"));
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
});

describe("SignUpPage — adults only (PAD-445, auth.register rule 18)", () => {
  it("refuses a day short of 18 on the birth-date field and sends nothing", async () => {
    mount();
    fill(yearsAgo(18, 1));
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-birthDate-error")).toHaveTextContent("auth.signup.birthDateUnderage");
    expect(register).not.toHaveBeenCalled();
  });

  it("never shows the guardian field, even for a 12-year-old's date (under PT's 13)", () => {
    mount();
    fill(yearsAgo(12));
    expect(screen.queryByTestId("signup-guardian")).toBeNull();
  });

  it("sends an 18th birthday today", async () => {
    register.mockResolvedValue({ accessToken: "t", user: { id: 1, role: "student" } });
    mount();
    fill(yearsAgo(18));
    fireEvent.click(screen.getByTestId("signup-submit"));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(register.mock.calls[0][0]).not.toHaveProperty("guardianEmail");
  });

  it("maps a server UNDERAGE to the same message on the same field", async () => {
    register.mockRejectedValue({
      response: {
        status: 400,
        data: { field: "birthDate", code: "UNDERAGE", error: "Data de nascimento inválida. … / Invalid date of birth. …" },
      },
    });
    mount();
    fill(yearsAgo(30));
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-birthDate-error")).toHaveTextContent("auth.signup.birthDateUnderage");
  });
});

describe("SignUpPage — the Terms must be accepted (PAD-485, auth.register rule 19)", () => {
  it("unticked, nothing is sent and the box says why", async () => {
    mount();
    fill(yearsAgo(30), { terms: false });
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-terms-error")).toHaveTextContent("auth.signup.termsRequired");
    expect(register).not.toHaveBeenCalled();
  });

  it("ticking the box clears the message, and the sign-up sends termsAccepted: true", async () => {
    register.mockResolvedValue({ accessToken: "t", user: { id: 1, role: "student" } });
    mount();
    fill(yearsAgo(30), { terms: false });
    fireEvent.click(screen.getByTestId("signup-submit"));
    await screen.findByTestId("signup-terms-error");

    fireEvent.click(screen.getByTestId("signup-terms"));
    expect(screen.queryByTestId("signup-terms-error")).toBeNull();
    fireEvent.click(screen.getByTestId("signup-submit"));
    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    expect(register.mock.calls[0][0]).toMatchObject({ termsAccepted: true });
  });

  it("both documents are linked from the box", () => {
    mount();
    const label = document.querySelector('label[for="signup-terms"]') as HTMLElement;
    expect([...label.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/privacy", "/terms"]);
  });

  it("maps a server TERMS_REQUIRED to the same message on the box", async () => {
    register.mockRejectedValue({ response: { status: 400, data: { field: "terms", code: "TERMS_REQUIRED", error: "…" } } });
    mount();
    fill(yearsAgo(30));
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-terms-error")).toHaveTextContent("auth.signup.termsRequired");
  });
});

