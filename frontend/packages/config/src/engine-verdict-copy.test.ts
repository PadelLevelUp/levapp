import { describe, expect, it } from "vitest";

import { ENGINE_NOT_IN_POOL_REASONS, ENGINE_STAGES, engineVerdictLines } from "./engine-verdict-copy";
import { resolveText } from "./invite-simulation";
import { localeT } from "./testkit/locale-t";

const render = (lng: "pt" | "en", v: Parameters<typeof engineVerdictLines>[0]) =>
  engineVerdictLines(v).map((l) => resolveText(localeT(lng), l));

describe("PAD-920 the dry run's words (notifications.invite-simulation N6)", () => {
  it("[NOTIFICATIONS-INVITE-SIMULATION-24] every stage and reason has a line in both locales", () => {
    for (const lng of ["pt", "en"] as const) {
      for (const stage of ENGINE_STAGES) {
        const [line] = render(lng, { stage });
        expect(line).not.toMatch(/^tutorials\./);
      }
      for (const code of ENGINE_NOT_IN_POOL_REASONS) {
        const lines = render(lng, { stage: "not_in_pool", reasons: [{ code }] });
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) expect(line).not.toMatch(/^tutorials\./);
      }
    }
    expect(render("pt", { stage: "busy_same_time" })).toEqual(["Noutra aula à mesma hora"]);
    expect(render("en", { stage: "invited_for_other_type" })).toEqual(["Invited for the other side"]);
    // A not_in_pool with two reasons gives two lines.
    expect(render("pt", { stage: "not_in_pool", reasons: [{ code: "inactive_account" }, { code: "blocks_all" }] })).toEqual([
      "Conta inativa",
      "Desligou todas as notificações",
    ]);
    // Eligibility reads today's structured lines from its failures.
    const elig = render("en", {
      stage: "not_in_pool",
      reasons: [{ code: "eligibility", failures: [{ attribute: "has_makeups", reason: "failed" } as never] }],
    });
    expect(elig).toHaveLength(1);
    expect(elig[0]).not.toMatch(/^tutorials\./);
    // An unknown code shows "Other reason", never the raw code.
    expect(render("pt", { stage: "brand_new_stage" })).toEqual(["Outro motivo"]);
    expect(render("en", { stage: "not_in_pool", reasons: [{ code: "brand_new_gate" }] })).toEqual(["Other reason"]);
  });
});
