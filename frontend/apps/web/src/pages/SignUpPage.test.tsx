/**
 * auth.register rule 18 (PAD-445): the web form refuses anyone under 18 on the birth-date field
 * before any request, maps a server `UNDERAGE` to the same message, and never asks for a
 * guardian's email any more.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const pad = (n: number) => String(n).padStart(2, "0");
/** A local date `years` years ago, shifted by `days`. */
function yearsAgo(years: number, days = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fill(birthDate: string) {
  const set = (id: string, value: string) =>
    fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
  set("signup-name", "Teen Silva");
  set("signup-username", "teen");
  set("signup-email", "teen@example.com");
  set("signup-password", "Segura123");
  set("signup-repeatPassword", "Segura123");
  set("signup-birthDate", birthDate);
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
