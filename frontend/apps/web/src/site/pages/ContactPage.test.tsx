import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));
vi.mock("@/lib/hubspot", () => ({
  demoFormId: () => "form-1",
  hasMarketingSubscription: () => false,
  loadTrackingScript: () => undefined,
}));
const sendDemoRequest = vi.fn();
vi.mock("@/lib/demoRequest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demoRequest")>()),
  sendDemoRequest: (b: unknown) => sendDemoRequest(b),
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import ContactPage from "./ContactPage";

const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });
const click = (id: string) => fireEvent.click(screen.getByTestId(id));

/** PAD-656: /contacto hosts the site's one contact form inside the site's frame. */
describe("ContactPage", () => {
  it("renders the form in the site frame and sends no pedido, from the /contacto URL", async () => {
    window.history.pushState({}, "", "/contacto");
    sendDemoRequest.mockResolvedValue({ ok: true });
    render(
      <MemoryRouter initialEntries={["/contacto"]}>
        <ContactPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("site")).toBeTruthy();
    expect(screen.getByTestId("contact-page")).toBeTruthy();
    expect(screen.queryByTestId("demo-dialog")).toBeNull();
    type("demo-firstname", "Rita");
    type("demo-lastname", "Lopes");
    type("demo-phone", "912 345 678");
    type("demo-email", "rita@academia.pt");
    type("demo-clube", "Academia Norte");
    click("demo-gestao-ninguem_trata");
    click("demo-lembretes-diariamente");
    click("demo-tempo-mais_3h");
    click("demo-consent");
    click("demo-submit");
    await waitFor(() => expect(sendDemoRequest).toHaveBeenCalledTimes(1));
    const body = sendDemoRequest.mock.calls[0][0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("pedido");
    expect(String(body.pageUri)).toMatch(/\/contacto$/);
    await screen.findByTestId("demo-sent");
    expect(screen.getByTestId("contact-home").getAttribute("href")).toBe("/");
    expect(screen.queryByTestId("demo-close")).toBeNull();
  });
});
