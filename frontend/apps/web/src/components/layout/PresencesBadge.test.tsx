/**
 * PAD-443 (`attendance.validation` rule 23): the Presences item carries the number of classes
 * still to validate — the dashboard's number — tiered: none at 0, yellow 1–5, red above 5. The
 * number is always in the badge, so the colour is never the only signal.
 *
 * Criterion: "The Presences badge is the dashboard's number, with its tier".
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PresencesBadge } from "./PresencesBadge";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));

describe("PresencesBadge", () => {
  it("shows 1 in the attention tier", () => {
    render(<PresencesBadge count={1} />);
    const badge = screen.getByTestId("nav-presences-badge");
    expect(badge).toHaveAttribute("data-tier", "attention");
    expect(badge).toHaveTextContent("1");
    expect(badge.getAttribute("aria-label")).toContain('"count":1');
  });

  it("shows 7 in the urgent tier", () => {
    render(<PresencesBadge count={7} />);
    const badge = screen.getByTestId("nav-presences-badge");
    expect(badge).toHaveAttribute("data-tier", "urgent");
    expect(badge).toHaveTextContent("7");
  });

  it("renders nothing when there is nothing to validate", () => {
    render(<PresencesBadge count={0} />);
    expect(screen.queryByTestId("nav-presences-badge")).toBeNull();
  });

  it("caps a large number the way the unread badge does", () => {
    render(<PresencesBadge count={140} />);
    expect(screen.getByTestId("nav-presences-badge")).toHaveTextContent("99+");
  });
});
