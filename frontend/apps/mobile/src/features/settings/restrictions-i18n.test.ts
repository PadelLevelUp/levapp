import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The restrictions section (notifications.config rule 14, PAD-433) and its copy (PAD-450).
 *
 * 1. Every `settings.restrictions.*` key the iOS section renders resolves to a string in pt and en
 *    — mobile i18n is static-import, so a missing key shows as a raw key path on a device only.
 * 2. PAD-450: "max simultaneous" caps INVITATIONS to a vacancy, so its label and description say
 *    invitation, not notification. Quiet hours and the minimum time before class keep "notify":
 *    `_check_restrictions` also gates the late-joiner reminder, so they do cover more than invites.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCALES = path.resolve(HERE, "../../../../../src/locales");
const SOURCE = fs.readFileSync(path.join(HERE, "restrictions-section.tsx"), "utf8");

function restrictions(lang: "en" | "pt"): Record<string, unknown> {
  const raw = JSON.parse(fs.readFileSync(path.join(LOCALES, lang, "settings.json"), "utf8"));
  return (raw.settings ?? raw).restrictions;
}

describe("restrictions section copy resolves in both languages (PAD-433)", () => {
  const keys = [...new Set([...SOURCE.matchAll(/`\$\{r\}\.(\w+)`/g)].map((m) => m[1]))];
  keys.push("excludedPlayers", "excludedPlayersDescription", "searchPlayers");

  it("finds the section's keys", () => {
    expect(keys.length).toBeGreaterThan(20);
  });

  it.each(["en", "pt"] as const)("every key is a string in %s", (lang) => {
    const r = restrictions(lang);
    expect(keys.filter((k) => typeof r[k] !== "string")).toEqual([]);
  });
});

describe("max simultaneous speaks of invitations (PAD-450)", () => {
  it("pt", () => {
    const r = restrictions("pt");
    expect(r.maxSimultaneous).toBe("Máximo de convites simultâneos");
    expect(r.maxSimultaneousDescription).toBe("Quantos alunos são convidados ao mesmo tempo");
  });

  it("en", () => {
    const r = restrictions("en");
    expect(r.maxSimultaneous).toBe("Max simultaneous invitations");
    expect(r.maxSimultaneousDescription).toBe("How many students are invited at the same time");
  });
});
