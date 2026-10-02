import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * PAD-484 (players.join-token rule 9): the invitation-link flow speaks of the coach's "base de alunos" /
 * "student base", never "plantel" / "roster"; the confirmation greets the student and says in one line
 * what accepting means; the success title names the coach. Web and iOS read the same strings.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(HERE, "../../../../../src/locales");
const read = (lang: string, ns: string) => JSON.parse(fs.readFileSync(path.join(LOCALES, lang, `${ns}.json`), "utf8"));

const FLOW = (lang: string): Record<string, string> => {
  const players = read(lang, "players").players;
  return {
    ...Object.fromEntries(Object.entries(players.joinCoach).map(([k, v]) => [`joinCoach.${k}`, v as string])),
    "addByQr.description": players.addByQr.description as string,
    "addByQr.rotateConfirmDescription": players.addByQr.rotateConfirmDescription as string,
    "messages.notConnectedYetHint": JSON.stringify(read(lang, "messages")).match(/"notConnectedYetHint":"([^"]*)"/)![1],
  };
};

describe("join-by-link copy (PAD-484)", () => {
  it.each([["pt", /plantel/i], ["en", /roster/i]] as const)("%s: no string of the flow says the old word", (lang, old) => {
    for (const [key, text] of Object.entries(FLOW(lang))) expect(text, key).not.toMatch(old);
  });

  it("the confirmation greets the student and says what accepting means", () => {
    expect(FLOW("pt")["joinCoach.explain"]).toMatch(/^Bem-vindo! .*base de alunos de \{\{coach\}\}.*aulas/);
    expect(FLOW("en")["joinCoach.explain"]).toMatch(/^Welcome! .*\{\{coach\}\}'s student base.*classes/);
  });

  it("the success title and the already-a-member line name the coach's student base", () => {
    for (const lang of ["pt", "en"]) {
      expect(FLOW(lang)["joinCoach.successTitle"]).toContain("{{coach}}");
      expect(FLOW(lang)["joinCoach.alreadyMember"]).toContain("{{coach}}");
    }
  });
});
