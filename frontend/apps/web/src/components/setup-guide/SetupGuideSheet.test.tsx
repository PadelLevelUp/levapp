/**
 * dashboard.student-setup-guide rule 4 (PAD-839): every close of the first-login sheet but
 * "Não mostrar mais" snoozes it, once.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}|${Object.values(opts).join("|")}` : key) }),
}));
vi.mock("@/auth/AuthContext", () => ({ useAuth: vi.fn() }));

import { SetupGuideSheet } from "./SetupGuideSurfaces";
import { makeGuide, STUDENT_ME, userEvent } from "./guide-fixture";

afterEach(cleanup);

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

/** 20% (coach only), never snoozed: the sheet is open and the next step is 1. */
const renderSheet = () => {
  const guide = makeGuide({ me: STUDENT_ME, device: "ask", incompleteCoaches: [] });
  expect(guide.view.showSheet).toBe(true);
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <SetupGuideSheet guide={guide} />
      <Where />
    </MemoryRouter>
  );
  expect(screen.getByTestId("setup-guide-sheet")).toBeTruthy();
  return guide;
};

describe("setup guide sheet", () => {
  it("[DASHBOARD-STUDENT-SETUP-GUIDE-24] every close but hide snoozes", async () => {
    const user = userEvent.setup();
    const snoozed = (g: ReturnType<typeof renderSheet>) => {
      expect(g.write).toHaveBeenCalledTimes(1);
      expect(g.write).toHaveBeenCalledWith({ setupGuideSnooze: true });
    };

    // Agora não
    let guide = renderSheet();
    await user.click(screen.getByTestId("setup-guide-later"));
    snoozed(guide);
    expect(screen.queryByTestId("setup-guide-sheet")).toBeNull();
    cleanup();

    // Começar: snoozes once and opens the next pending step.
    guide = renderSheet();
    await user.click(screen.getByTestId("setup-guide-start"));
    snoozed(guide);
    expect(screen.getByTestId("where").textContent).toBe(`/setup?step=${guide.view.next}`);
    cleanup();

    // Escape
    guide = renderSheet();
    await user.keyboard("{Escape}");
    snoozed(guide);
    cleanup();

    // Outside the sheet (the backdrop)
    guide = renderSheet();
    await new Promise((r) => setTimeout(r, 10)); // Radix arms its outside-press listener on the next tick
    fireEvent.pointerDown(document.body);
    snoozed(guide);
    cleanup();

    // Não mostrar mais: hides, never snoozes.
    guide = renderSheet();
    await user.click(screen.getByTestId("setup-guide-hide"));
    expect(guide.write).toHaveBeenCalledTimes(1);
    expect(guide.write).toHaveBeenCalledWith({ setupGuideHidden: true });
    expect(guide.write).not.toHaveBeenCalledWith({ setupGuideSnooze: true });
  });
});
