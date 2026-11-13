/**
 * PAD-920 (dashboard.blocks NA1–NA2): the coach alert card on web. Its words come from the shared
 * copy helper; the card opens the class. Asserted by test id and i18n key (`t` returns the key).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DashboardNeedsYouBlock, DashboardNeedsYouEngineAlert } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, p?: Record<string, unknown>) => (p ? `${key}:${JSON.stringify(p)}` : key),
    i18n: { language: "pt" },
  }),
}));
const navigate = vi.fn();
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<object>()), useNavigate: () => navigate }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const snooze = vi.fn().mockResolvedValue(undefined);
vi.mock("@levelup/api/src/resources/dashboard", () => ({ snoozeNeedsYouItem: (...a: unknown[]) => snooze(...a) }));

import { NeedsYouQueue } from "./NeedsYouQueue";

const alert: DashboardNeedsYouEngineAlert = {
  kind: "engine_alert",
  id: "engine_alert:12:right",
  lessonInstanceId: 12,
  classTitle: "Iniciação",
  date: "2026-11-19",
  startTime: "19:00",
  reason: "no_candidate",
  side: "right",
  levelId: null,
  levelLabel: null,
  count: 1,
  href: "/calendar?classId=lessoninstance-12&date=2026-11-19",
};

const block = (items: DashboardNeedsYouBlock["data"]["items"]): DashboardNeedsYouBlock => ({
  id: "needs_you",
  type: "needs_you",
  data: { count: items.length, items },
});

afterEach(() => {
  cleanup();
  navigate.mockReset();
});

describe("PAD-920 the coach alert card on web", () => {
  it("[DASHBOARD-BLOCKS-49] shows the coach alert card and opens the class", () => {
    render(<NeedsYouQueue block={block([alert])} />);
    const card = screen.getByTestId("needs-you-engine-alert-12-right");
    expect(card).toHaveTextContent("dashboard.needsYou.engineAlert.title");
    expect(card).toHaveTextContent("dashboard.needsYou.engineAlert.lineSided");
    expect(card).toHaveTextContent('"class":"Iniciação"');
    expect(card).toHaveTextContent("dashboard.needsYou.engineAlert.hint");
    fireEvent.click(card);
    expect(navigate).toHaveBeenCalledWith("/calendar?classId=lessoninstance-12&date=2026-11-19");
  });

  it("snoozes with 'Mais tarde' without opening the class", async () => {
    render(<NeedsYouQueue block={block([alert])} />);
    fireEvent.click(screen.getByTestId("needs-you-later"));
    expect(snooze).toHaveBeenCalledWith("engine_alert:12:right");
    expect(navigate).not.toHaveBeenCalled();
  });
});
