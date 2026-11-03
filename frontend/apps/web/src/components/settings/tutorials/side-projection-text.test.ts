import { describe, expect, it } from "vitest";
import i18next from "i18next";
import { describeSideReasoning, describeSideRoster, resolveText } from "@levelup/config";
import type { InviteSimulationSpot } from "@levelup/types";
import en from "../../../../../../src/locales/en/tutorials.json";
import pt from "../../../../../../src/locales/pt/tutorials.json";

/** PAD-825 (settings.tutorials rule 4.4): the side line says its counts are a projection (going
 * plus the open spots on their reserved side), and the roster line under it reconciles them —
 * PAD-822's coach read "8L/8R" as the roster. Web and iOS load these same files. */
async function tFor(lng: "en" | "pt") {
  const i18n = i18next.createInstance();
  await i18n.init({ lng, resources: { en: { translation: en }, pt: { translation: pt } }, interpolation: { escapeValue: false } });
  return i18n.t.bind(i18n) as (key: string, params?: Record<string, unknown>) => string;
}

type Counts = NonNullable<InviteSimulationSpot["sideCounts"]>;
const pad822: Counts = {
  left: 8, right: 8, leaverSide: "right", chosen: "right",
  going: { left: 8, right: 4 }, open: { left: 0, right: 4 },
};
const PREFIX = {
  pt: "Contando quem vai e as vagas abertas (cada uma no lado a que está reservada), ",
  en: "Counting who is going plus the open spots on their reserved side, ",
};

describe("PAD-825: the side counts read as a projection, next to the roster", () => {
  for (const lng of ["pt", "en"] as const) {
    it(`${lng}: every side sentence with counts names the projection`, async () => {
      const t = await tFor(lng);
      for (const [leaverSide, chosen] of [["right", "right"], ["left", "left"], [null, null]] as const) {
        const spot = { sideCounts: { ...pad822, leaverSide, chosen } };
        const tie = resolveText(t, describeSideReasoning(spot));
        expect(tie.startsWith(PREFIX[lng]), tie).toBe(true);
      }
      const fewer = resolveText(t, describeSideReasoning({ sideCounts: { ...pad822, left: 8, right: 7 } }));
      expect(fewer.startsWith(PREFIX[lng]), fewer).toBe(true);
    });
  }

  it("pt: the roster line", async () => {
    const roster = describeSideRoster({ sideCounts: pad822 });
    expect(roster && resolveText(await tFor("pt"), roster)).toBe(
      "Agora vão 8 de esquerda e 4 de direita (sem quem falta); vagas abertas: 0 de esquerda e 4 de direita.",
    );
  });

  it("en: the roster line", async () => {
    const roster = describeSideRoster({ sideCounts: pad822 });
    expect(roster && resolveText(await tFor("en"), roster)).toBe(
      "Now 8 left and 4 right going (without the student who cancels); open spots: 0 left and 4 right.",
    );
  });
});
