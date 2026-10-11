import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) =>
      opts?.name ? `${key}|${opts.name}` : key,
  }),
}));

const sendDemoRequest = vi.fn();
vi.mock("@/lib/demoRequest", () => ({
  sendDemoRequest: (b: unknown) => sendDemoRequest(b),
}));

import { DemoRequestDialog } from "./DemoRequestDialog";

// Radix's checkbox measures itself with ResizeObserver, which jsdom lacks.
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

function fillValid() {
  type("demo-fullname", "Rita Pereira Lopes");
  type("demo-email", "rita@academia.pt");
  type("demo-phone", "+351 912 345 678");
  type("demo-company", "Academia Norte");
  type("demo-city", "Porto");
  type("demo-alunos", "30");
  type("demo-horas", "20");
  fireEvent.click(screen.getByTestId("demo-consent"));
}

const submit = () => fireEvent.click(screen.getByTestId("demo-submit"));

describe("DemoRequestDialog (PAD-617)", () => {
  beforeEach(() => {
    sendDemoRequest.mockReset();
    document.cookie = "hubspotutk=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  });
  afterEach(cleanup);

  it("renders the notice, every field, the honeypot and the submit", () => {
    renderDialog();
    expect(screen.getByTestId("demo-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("demo-hubspot-notice")).toBeInTheDocument();
    const noticeLink = screen.getByTestId("demo-hubspot-notice").querySelector("a");
    expect(noticeLink).toHaveAttribute("href", "/privacy");
    for (const f of [
      "fullname", "email", "phone", "company", "city", "alunos", "horas", "message", "consent",
    ]) {
      expect(screen.getByTestId(`demo-${f}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("demo-alunos")).toHaveAttribute("type", "number");
    const hp = screen.getByTestId("demo-website");
    expect(hp).toHaveAttribute("name", "website");
    expect(hp).toHaveAttribute("tabindex", "-1");
    expect(hp.closest("[aria-hidden='true']")).not.toBeNull();
    expect(screen.getByTestId("demo-submit")).toBeEnabled();
  });

  it("blocks an empty submit and shows an error per required field", () => {
    renderDialog();
    submit();
    expect(sendDemoRequest).not.toHaveBeenCalled();
    for (const f of ["fullname", "email", "phone", "company", "city", "alunos", "horas", "consent"]) {
      expect(screen.getByTestId(`demo-${f}-error`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("demo-message-error")).toBeNull();
  });

  it("rejects non-integer counts and a long message", () => {
    renderDialog();
    fillValid();
    type("demo-alunos", "2.5");
    type("demo-horas", "0");
    type("demo-message", "x".repeat(2001));
    submit();
    expect(sendDemoRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId("demo-alunos-error")).toBeInTheDocument();
    expect(screen.getByTestId("demo-horas-error")).toBeInTheDocument();
    expect(screen.getByTestId("demo-message-error")).toBeInTheDocument();
  });

  it("sends the exact body without hutk when the cookie is absent", async () => {
    sendDemoRequest.mockResolvedValue({ ok: true });
    renderDialog();
    fillValid();
    submit();
    await waitFor(() => expect(sendDemoRequest).toHaveBeenCalledTimes(1));
    const body = sendDemoRequest.mock.calls[0][0];
    expect(body).toEqual({
      fullname: "Rita Pereira Lopes",
      email: "rita@academia.pt",
      phone: "+351 912 345 678",
      company: "Academia Norte",
      city: "Porto",
      alunos: 30,
      horas: 20,
      message: "",
      consent: true,
      pedido: "demonstracao",
      pageUri: window.location.href,
      pageName: document.title,
      website: "",
      elapsedMs: expect.any(Number),
    });
    expect("hutk" in body).toBe(false);
  });

  it("sends hutk and the chosen pedido when the cookie exists", async () => {
    document.cookie = "hubspotutk=abc123; path=/";
    sendDemoRequest.mockResolvedValue({ ok: true });
    renderDialog({ pedido: "mes_gratis" });
    fillValid();
    submit();
    await waitFor(() => expect(sendDemoRequest).toHaveBeenCalled());
    expect(sendDemoRequest.mock.calls[0][0]).toMatchObject({
      hutk: "abc123",
      pedido: "mes_gratis",
    });
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

  it.each([502, 503, 429, 0])("offers the mailto on %i", async (status) => {
    sendDemoRequest.mockResolvedValue({ ok: false, status });
    renderDialog();
    fillValid();
    submit();
    expect(await screen.findByTestId("demo-failed")).toBeInTheDocument();
    expect(screen.getByTestId("demo-failed-mailto")).toHaveAttribute("href", MAILTO);
  });

  it("thanks the visitor by first name on 200", async () => {
    sendDemoRequest.mockResolvedValue({ ok: true });
    renderDialog();
    fillValid();
    submit();
    const sent = await screen.findByTestId("demo-sent");
    expect(sent.textContent).toContain("Rita");
    expect(sent.textContent).not.toContain("Pereira");
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
    expect((screen.getByTestId("demo-fullname") as HTMLInputElement).value).toBe("");
  });
});
