import { describe, expect, it } from "vitest";

import type { DashboardNeedsYouEngineAlert } from "@levelup/types";
import { engineAlertCopy } from "./engine-alert-copy";
import { resolveText } from "./invite-simulation";
import { localeT } from "./testkit/locale-t";

const item: DashboardNeedsYouEngineAlert = {
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

describe("PAD-920 the coach alert card's words (dashboard.blocks NA2)", () => {
  it("names the class, the spots and the side in both locales, with the shared test id", () => {
    const c = engineAlertCopy(item, "pt");
    expect(c.testId).toBe("needs-you-engine-alert-12-right");
    expect(localeT("pt")(c.titleKey)).toBe("Ninguém para convidar");
    expect(resolveText(localeT("pt"), c.line)).toBe("1 vaga(s) (lado direito) · Iniciação, Qui 19:00");
    expect(resolveText(localeT("en"), engineAlertCopy(item, "en").line)).toBe("1 open spot(s) (right side) · Iniciação, Thu 19:00");
    expect(localeT("en")(c.hintKey)).toBe("Invite someone by hand or widen your invitation groups.");
  });

  it("says nothing about a side for an either-side spot", () => {
    const c = engineAlertCopy({ ...item, side: null, count: 2 }, "en");
    expect(c.testId).toBe("needs-you-engine-alert-12-either");
    expect(resolveText(localeT("en"), c.line)).toBe("2 open spot(s) · Iniciação, Thu 19:00");
  });
});
