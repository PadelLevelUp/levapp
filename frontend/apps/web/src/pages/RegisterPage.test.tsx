/**
 * auth.activate rule 13 (PAD-457): the web activation form asks for the birth date, refuses under
 * 18 on the field before sending, maps a server UNDERAGE to the same field, and sends the date.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const registerUser = vi.fn();
const activateAccount = vi.fn();
vi.mock("@/api/register", () => ({
  registerUser: (...a: unknown[]) => registerUser(...a),
  activateAccount: (...a: unknown[]) => activateAccount(...a),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }) }));

import RegisterPage from "./RegisterPage";

const pad = (n: number) => String(n).padStart(2, "0");
function yearsAgo(years: number, days = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function mountFilled(birthDate: string, terms = true) {
  render(
    <MemoryRouter initialEntries={["/register/5?t=secret"]}>
      <Routes>
        <Route path="/register/:userId" element={<RegisterPage />} />
        <Route path="/auth" element={<p>auth</p>} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByLabelText("auth.register.birthDate");
  const set = (id: string, value: string) =>
    fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value } });
  set("name", "Bruno Silva");
  set("username", "bruno");
  set("email", "bruno@example.com");
  set("password", "Segura123");
  set("repeatPassword", "Segura123");
  set("birthDate", birthDate);
  if (terms) fireEvent.click(screen.getByTestId("register-terms"));
}

beforeEach(() => {
  registerUser.mockReset().mockResolvedValue({ isActive: false, name: "Bruno", username: null, email: "", phone: "" });
  activateAccount.mockReset();
});

describe("RegisterPage — adults only at activation (PAD-457)", () => {
  it("refuses a day short of 18 on the birth-date field and sends nothing", async () => {
    await mountFilled(yearsAgo(18, 1));
    fireEvent.click(screen.getByRole("button", { name: "auth.register.activate" }));
    expect(await screen.findByTestId("register-birthDate-error")).toHaveTextContent("auth.register.birthDateUnderage");
    expect(activateAccount).not.toHaveBeenCalled();
  });

  it("sends the birth date with the activation", async () => {
    activateAccount.mockResolvedValue({ success: true });
    const date = yearsAgo(30);
    await mountFilled(date);
    fireEvent.click(screen.getByRole("button", { name: "auth.register.activate" }));
    await waitFor(() => expect(activateAccount).toHaveBeenCalledTimes(1));
    expect(activateAccount.mock.calls[0][0].content.birthDate).toBe(date);
  });

  it("shows a server UNDERAGE on the birth-date field", async () => {
    activateAccount.mockRejectedValue({ response: { status: 400, data: { field: "birthDate", code: "UNDERAGE", error: "…" } } });
    await mountFilled(yearsAgo(30));
    fireEvent.click(screen.getByRole("button", { name: "auth.register.activate" }));
    expect(await screen.findByTestId("register-birthDate-error")).toHaveTextContent("auth.register.birthDateUnderage");
  });

  it("puts a server 409 on email on the email field, with what to do (PAD-761)", async () => {
    activateAccount.mockRejectedValue({ response: { status: 409, data: { field: "email", code: "EMAIL_TAKEN", error: "…" } } });
    await mountFilled(yearsAgo(30));
    fireEvent.click(screen.getByRole("button", { name: "auth.register.activate" }));
    expect(await screen.findByTestId("register-email-error")).toHaveTextContent("auth.register.emailHasAccount");
  });
});

describe("RegisterPage — the country (PAD-604, auth.activate rule 13a)", () => {
  it("shows the country field defaulted to Portugal and sends PT", async () => {
    activateAccount.mockResolvedValue({ success: true });
    await mountFilled(yearsAgo(30));
    expect(screen.getByTestId("register-country")).toHaveTextContent("Portugal");
    fireEvent.click(screen.getByRole("button", { name: "auth.register.activate" }));
    await waitFor(() => expect(activateAccount).toHaveBeenCalledTimes(1));
    expect(activateAccount.mock.calls[0][0].content.country).toBe("PT");
  });

  it.each(["COUNTRY_REQUIRED", "INVALID_COUNTRY"])("puts a server %s on the country field", async (code) => {
    activateAccount.mockRejectedValue({ response: { status: 400, data: { field: "country", code } } });
    await mountFilled(yearsAgo(30));
    fireEvent.click(screen.getByRole("button", { name: "auth.register.activate" }));
    expect(await screen.findByTestId("register-country-error")).toHaveTextContent("auth.register.countryRequired");
  });
});

describe("RegisterPage — the Terms (PAD-637, auth.activate rule 13b)", () => {
  const activate = () => fireEvent.click(screen.getByRole("button", { name: "auth.register.activate" }));

  it("refuses an unticked box on the box and sends nothing", async () => {
    await mountFilled(yearsAgo(30), false);
    activate();
    expect(await screen.findByTestId("register-terms-error")).toHaveTextContent("auth.legal.termsRequiredToContinue");
    expect(activateAccount).not.toHaveBeenCalled();
  });

  it("sends termsAccepted with the activation", async () => {
    activateAccount.mockResolvedValue({ success: true });
    await mountFilled(yearsAgo(30));
    activate();
    await waitFor(() => expect(activateAccount).toHaveBeenCalled());
    expect(activateAccount.mock.calls[0][0].content).toMatchObject({ termsAccepted: true });
  });

  it("puts a server TERMS_REQUIRED on the box", async () => {
    activateAccount.mockRejectedValue({ response: { status: 400, data: { field: "terms", code: "TERMS_REQUIRED" } } });
    await mountFilled(yearsAgo(30));
    activate();
    expect(await screen.findByTestId("register-terms-error")).toHaveTextContent("auth.legal.termsRequiredToContinue");
  });
});
