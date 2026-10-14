import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CONSENT_STORAGE_KEY, writeConsent } from "@/lib/cookieConsent";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "pt" },
  }),
}));

const sendDemoRequest = vi.fn();
vi.mock("@/lib/demoRequest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demoRequest")>()),
  sendDemoRequest: (b: unknown) => sendDemoRequest(b),
}));

import { DemoRequestDialog } from "./DemoRequestDialog";

// Radix's checkbox and radio group measure themselves with ResizeObserver, which jsdom lacks.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const MAILTO = "mailto:admin@levapp.app?subject=x";

const renderDialog = (props: Partial<React.ComponentProps<typeof DemoRequestDialog>> = {}) =>
  render(
    <MemoryRouter>
      <DemoRequestDialog open onOpenChange={() => {}} fallbackHref={MAILTO} {...props} />
    </MemoryRouter>,
  );

const type = (id: string, value: string) =>
  fireEvent.change(screen.getByTestId(id), { target: { value } });

const click = (id: string) => fireEvent.click(screen.getByTestId(id));

function fillValid() {
  type("demo-firstname", "Rita");
  type("demo-lastname", "Pereira Lopes");
  type("demo-phone", "912 345 678");
  type("demo-email", "rita@academia.pt");
  type("demo-clube", "Academia Norte");
  click("demo-gestao-ninguem_trata");
  click("demo-gestao-ferramentas_classicas");
  click("demo-lembretes-diariamente");
  click("demo-tempo-mais_3h");
  click("demo-consent");
}

const submit = () => click("demo-submit");

describe("DemoRequestDialog (PAD-617, PAD-650)", () => {
  beforeEach(() => {
    sendDemoRequest.mockReset();
    localStorage.removeItem(CONSENT_STORAGE_KEY);
    document.cookie = "hubspotutk=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });
  afterEach(cleanup);

  it("renders the heading, the fields in the ticket's order, the honeypot and one submit", () => {
    renderDialog();
    expect(screen.getByTestId("demo-dialog")).toBeInTheDocument();
    expect(screen.getByText("landing.demo.title")).toBeInTheDocument();
    const order = [
      "demo-firstname", "demo-lastname", "demo-phone", "demo-email", "demo-clube",
      "demo-gestao-ferramentas_classicas", "demo-lembretes-diariamente", "demo-tempo-menos_1h",
      "demo-consent",
    ].map((id) => screen.getByTestId(id));
    for (let i = 1; i < order.length; i++) {
      // DOCUMENT_POSITION_FOLLOWING: each field comes after the one before it.
      expect(order[i - 1].compareDocumentPosition(order[i]) & 4).toBe(4);
    }
    for (const v of ["ferramentas_classicas", "clube_outro_treinador", "ninguem_trata", "outro"]) {
      expect(screen.getByTestId(`demo-gestao-${v}`)).toBeInTheDocument();
    }
    for (const v of ["diariamente", "semanalmente", "nao_envia"]) {
      expect(screen.getByTestId(`demo-lembretes-${v}`)).toBeInTheDocument();
    }
    for (const v of ["menos_1h", "1_3h", "mais_3h"]) {
      expect(screen.getByTestId(`demo-tempo-${v}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("demo-privacy-line").querySelector("a")).toHaveAttribute("href", "/privacy");
    const hp = screen.getByTestId("demo-website");
    expect(hp).toHaveAttribute("name", "website");
    expect(hp).toHaveAttribute("tabindex", "-1");
    // inert, not aria-hidden: out of the tab order and the accessibility tree without an axe violation.
    expect(hp.closest("[inert]")).not.toBeNull();
    expect(hp.closest("[aria-hidden='true']")).toBeNull();
    expect(screen.getAllByRole("button", { name: "landing.demo.submit" })).toHaveLength(1);
  });

  it("hides the marketing box without a subscription and shows it, unticked, with one", () => {
    renderDialog();
    expect(screen.queryByTestId("demo-marketing")).toBeNull();
    cleanup();
    renderDialog({ showMarketing: true });
    expect(screen.getByTestId("demo-marketing")).toHaveAttribute("data-state", "unchecked");
  });

  it("blocks an empty submit and shows an error per required field", () => {
    renderDialog({ showMarketing: true });
    submit();
    expect(sendDemoRequest).not.toHaveBeenCalled();
    for (const f of [
      "firstname", "lastname", "phone", "email", "clube", "gestao", "lembretes", "tempo", "consent",
    ]) {
      expect(screen.getByTestId(`demo-${f}-error`)).toHaveAttribute("role", "alert");
    }
    expect(screen.queryByTestId("demo-marketing-error")).toBeNull();
  });

  it("moves focus to the first invalid field", async () => {
    renderDialog();
    type("demo-firstname", "Rita");
    submit();
    await waitFor(() => expect(screen.getByTestId("demo-lastname")).toHaveFocus());
  });

  it.each(["123", "812345678", "+351 812 345 678", "abc"])("refuses the phone %s", (phone) => {
    renderDialog();
    fillValid();
    type("demo-phone", phone);
    submit();
    expect(sendDemoRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId("demo-phone-error")).toBeInTheDocument();
  });

  it("marks the required fields and points each group's options at its error", () => {
    renderDialog();
    for (const id of ["demo-firstname", "demo-phone", "demo-clube", "demo-consent"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("aria-required", "true");
    }
    submit();
    expect(screen.getByTestId("demo-gestao-outro")).toHaveAttribute("aria-describedby", "demo-gestao-error");
    expect(screen.getByTestId("demo-tempo-1_3h")).toHaveAttribute("aria-describedby", "demo-tempo-error");
  });

  it("refuses an invalid email and an unticked consent", () => {
    renderDialog();
    fillValid();
    type("demo-email", "rita@");
    click("demo-consent");
    submit();
    expect(sendDemoRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId("demo-email-error")).toBeInTheDocument();
    expect(screen.getByTestId("demo-consent-error")).toBeInTheDocument();
  });

  it("sends the exact body: internal values, normalised phone, no hutk without consent", async () => {
    document.cookie = "hubspotutk=0123456789abcdef0123456789abcdef; path=/";
    sendDemoRequest.mockResolvedValue({ ok: true });
    renderDialog({ pedido: "demonstracao" });
    fillValid();
    submit();
    await waitFor(() => expect(sendDemoRequest).toHaveBeenCalledTimes(1));
    const body = sendDemoRequest.mock.calls[0][0];
    expect(body).toEqual({
      firstname: "Rita",
      lastname: "Pereira Lopes",
      phone: "+351 912 345 678",
      email: "rita@academia.pt",
      clube: "Academia Norte",
      gestao: ["ferramentas_classicas", "ninguem_trata"],
      lembretes: "diariamente",
      tempo: "mais_3h",
      consent: true,
      marketing: false,
      pedido: "demonstracao",
      lang: "pt",
      pageUri: window.location.href,
      pageName: document.title,
      website: "",
      elapsedMs: expect.any(Number),
    });
    // The cookie is there but the stored choice is not "accepted": it stays home (rule 10).
    expect("hutk" in body).toBe(false);
  });

  it("sends hutk once the visitor accepted cookies, and the marketing box as ticked", async () => {
    writeConsent("accepted");
    document.cookie = "hubspotutk=0123456789abcdef0123456789abcdef; path=/";
    sendDemoRequest.mockResolvedValue({ ok: true });
    renderDialog({ showMarketing: true });
    fillValid();
    click("demo-marketing");
    submit();
    await waitFor(() => expect(sendDemoRequest).toHaveBeenCalled());
    const body = sendDemoRequest.mock.calls[0][0];
    expect(body).toMatchObject({ hutk: "0123456789abcdef0123456789abcdef", marketing: true });
    // Opened from a non-demo button: no pedido at all.
    expect("pedido" in body).toBe(false);
  });

  it("sends no hutk after a decline even if the cookie lingers", async () => {
    writeConsent("declined");
    document.cookie = "hubspotutk=0123456789abcdef0123456789abcdef; path=/";
    sendDemoRequest.mockResolvedValue({ ok: true });
    renderDialog();
    fillValid();
    submit();
    await waitFor(() => expect(sendDemoRequest).toHaveBeenCalled());
    expect("hutk" in sendDemoRequest.mock.calls[0][0]).toBe(false);
  });

  it("puts a server 400 on its field", async () => {
    sendDemoRequest.mockResolvedValue({ ok: false, status: 400, field: "email", code: "INVALID_FIELD" });
    renderDialog();
    fillValid();
    submit();
    expect(await screen.findByTestId("demo-email-error")).toBeInTheDocument();
    expect(screen.queryByTestId("demo-failed")).toBeNull();
    expect(screen.getByTestId("demo-submit")).toBeEnabled();
  });

  it.each([502, 503, 429, 0])("offers a retry and the mailto on %i", async (status) => {
    sendDemoRequest.mockResolvedValue({ ok: false, status });
    renderDialog();
    fillValid();
    submit();
    expect(await screen.findByTestId("demo-failed")).toBeInTheDocument();
    expect(screen.getByTestId("demo-failed-mailto")).toHaveAttribute("href", MAILTO);
    sendDemoRequest.mockResolvedValue({ ok: true });
    click("demo-retry");
    expect(await screen.findByTestId("demo-sent")).toBeInTheDocument();
    expect(sendDemoRequest).toHaveBeenCalledTimes(2);
  });

  it("shows the thank-you without a promised delay on 200", async () => {
    sendDemoRequest.mockResolvedValue({ ok: true });
    renderDialog();
    fillValid();
    submit();
    const sent = await screen.findByTestId("demo-sent");
    expect(sent.textContent).toContain("landing.demo.sent.message");
    expect(screen.queryByTestId("demo-submit")).toBeNull();
  });

  it("disables submit while sending", async () => {
    let resolve!: (v: unknown) => void;
    sendDemoRequest.mockReturnValue(new Promise((r) => (resolve = r)));
    renderDialog();
    fillValid();
    submit();
    await waitFor(() => expect(screen.getByTestId("demo-submit")).toBeDisabled());
    resolve({ ok: true });
    await screen.findByTestId("demo-sent");
  });

  it("starts clean when closed and reopened", async () => {
    sendDemoRequest.mockResolvedValue({ ok: true });
    const ui = (open: boolean) => (
      <MemoryRouter>
        <DemoRequestDialog open={open} onOpenChange={() => {}} fallbackHref={MAILTO} />
      </MemoryRouter>
    );
    const { rerender } = render(ui(true));
    fillValid();
    submit();
    await screen.findByTestId("demo-sent");
    rerender(ui(false));
    rerender(ui(true));
    expect(screen.queryByTestId("demo-sent")).toBeNull();
    expect((screen.getByTestId("demo-firstname") as HTMLInputElement).value).toBe("");
    expect(screen.getByTestId("demo-gestao-ninguem_trata")).toHaveAttribute("data-state", "unchecked");
  });
});

describe("normalisePhone (PAD-650)", () => {
  it.each([
    ["912345678", "+351 912 345 678"],
    ["+351 912 345 678", "+351 912 345 678"],
    ["00351 96-123-4567", "+351 961 234 567"],
    ["+44 7700 900123", "+44 7700 900123"],
    ["812345678", null],
    ["123", null],
  ])("%s → %s", async (typed, expected) => {
    const { normalisePhone } = await import("@/lib/demoRequest");
    expect(normalisePhone(typed)).toBe(expected);
  });
});
