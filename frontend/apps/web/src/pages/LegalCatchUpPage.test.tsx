import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { legalCatchUpSession } from "@levelup/config";

/** PAD-637 (auth.legal-catch-up rules 2–5): one screen, only the missing parts, skippable. */
const navigate = vi.fn();
const acceptLegal = vi.fn();
const refreshUser = vi.fn();
let user: Record<string, unknown> = {};

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k, i18n: { language: "pt" } }) }));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => navigate }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user, refreshUser, isAuthenticated: true, loading: false }) }));
vi.mock("@/api/auth", () => ({ acceptLegal: (...a: unknown[]) => acceptLegal(...a) }));

import LegalCatchUpPage from "./LegalCatchUpPage";

const mount = () => render(<MemoryRouter><LegalCatchUpPage /></MemoryRouter>);
const save = () => fireEvent.click(screen.getByTestId("legalCatchUp-save"));
const typeDate = (v: string) => fireEvent.change(screen.getByTestId("legalCatchUp-birthDate"), { target: { value: v } });

beforeEach(() => {
  navigate.mockReset();
  acceptLegal.mockReset();
  refreshUser.mockReset();
  legalCatchUpSession.reset();
  user = { id: 7, roles: ["player"], coaches: [{ id: 1 }], legalPending: { terms: true, birthDate: true } };
});

describe("LegalCatchUpPage", () => {
  it("shows only the Terms box when only the Terms are pending", () => {
    user = { ...user, legalPending: { terms: true, birthDate: false } };
    mount();
    expect(screen.getByTestId("legalCatchUp-terms")).toBeInTheDocument();
    expect(screen.queryByTestId("legalCatchUp-birthDate")).toBeNull();
  });

  it("saves both parts and moves on to the usual landing", async () => {
    const after = { ...user, legalPending: { terms: false, birthDate: false } };
    acceptLegal.mockResolvedValue(after);
    refreshUser.mockResolvedValue(after);
    mount();
    fireEvent.click(screen.getByTestId("legalCatchUp-terms"));
    typeDate("1990-05-05");
    save();
    await waitFor(() => expect(acceptLegal).toHaveBeenCalledWith({ termsAccepted: true, birthDate: "1990-05-05" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true }));
  });

  it("refuses an unticked box and a missing date on their fields and sends nothing", async () => {
    mount();
    save();
    expect(await screen.findByTestId("legalCatchUp-terms-error")).toHaveTextContent("auth.legal.termsRequiredToContinue");
    expect(screen.getByTestId("legalCatchUp-birthDate-error")).toHaveTextContent("auth.legalCatchUp.birthDateRequired");
    expect(acceptLegal).not.toHaveBeenCalled();
  });

  it("refuses under 18 on the field before sending", async () => {
    mount();
    fireEvent.click(screen.getByTestId("legalCatchUp-terms"));
    const d = new Date();
    typeDate(`${d.getFullYear() - 17}-01-01`);
    save();
    expect(await screen.findByTestId("legalCatchUp-birthDate-error")).toHaveTextContent("auth.legalCatchUp.underage");
    expect(acceptLegal).not.toHaveBeenCalled();
  });

  it("puts a server UNDERAGE on the date field", async () => {
    acceptLegal.mockRejectedValue({ response: { status: 400, data: { field: "birthDate", code: "UNDERAGE" } } });
    mount();
    fireEvent.click(screen.getByTestId("legalCatchUp-terms"));
    typeDate("1990-05-05");
    save();
    expect(await screen.findByTestId("legalCatchUp-birthDate-error")).toHaveTextContent("auth.legalCatchUp.underage");
  });

  it("'Not now' skips for the session and moves on without saving", () => {
    mount();
    fireEvent.click(screen.getByTestId("legalCatchUp-notNow"));
    expect(acceptLegal).not.toHaveBeenCalled();
    expect(legalCatchUpSession.isSkipped(7)).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
  });
});
