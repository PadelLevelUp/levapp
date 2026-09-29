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
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import RegisterPage from "./RegisterPage";

const pad = (n: number) => String(n).padStart(2, "0");
function yearsAgo(years: number, days = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function mountFilled(birthDate: string) {
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
});
