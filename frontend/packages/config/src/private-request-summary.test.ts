import { describe, expect, it } from "vitest";
import ptFile from "../../../src/locales/pt/classRequestWizard.json";
import enFile from "../../../src/locales/en/classRequestWizard.json";
import { privateRequestSummary, type PrivateRequestSummaryInput } from "./private-request-summary";

type Tree = { [k: string]: string | Tree };
const tOf = (file: { classRequestWizard: Tree }) => (key: string, vars: Record<string, string | number> = {}) => {
  const leaf = key.split(".").reduce<string | Tree | undefined>((n, p) => (typeof n === "object" ? n[p] : undefined), file.classRequestWizard);
  if (typeof leaf !== "string") throw new Error(`missing key ${key}`);
  return leaf.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k]));
};
const pt = tOf(ptFile as unknown as { classRequestWizard: Tree });
const en = tOf(enFile as unknown as { classRequestWizard: Tree });

const base: PrivateRequestSummaryInput = { people: 1, invitees: [], recurring: "single", date: "2026-11-24", weekdays: [], endDate: "" };
const withCarla: PrivateRequestSummaryInput = { ...base, people: 2, invitees: ["Carla"] };
const weekly: PrivateRequestSummaryInput = { ...base, recurring: "weekly", weekdays: [2, 4], endDate: "2026-10-15" };

const keys = (t: Tree, prefix = ""): string[] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`)));

describe("the summary line", () => {
  it("[CLASSES-CLASS-REQUESTS-67] the summary line in pt and en", () => {
    expect(privateRequestSummary(base, pt)).toBe("Só eu · ter 24 nov");
    expect(privateRequestSummary(withCarla, pt)).toBe("2 pessoas · Carla · ter 24 nov");
    expect(privateRequestSummary(weekly, pt)).toBe("Só eu · ter, qui até 15 out");
    expect(privateRequestSummary(base, en)).toBe("Just me · Tue 24 Nov");
    expect(privateRequestSummary(withCarla, en)).toBe("2 people · Carla · Tue 24 Nov");
    expect(privateRequestSummary(weekly, en)).toBe("Just me · Tue, Thu until 15 Oct");
  });

  it("[CLASSES-CLASS-REQUESTS-67] the summary keys are the same in pt and en", () => {
    const summary = (f: { classRequestWizard: Tree }) => keys(f.classRequestWizard.summary as Tree).sort();
    expect(summary(ptFile as unknown as { classRequestWizard: Tree }).length).toBeGreaterThan(0);
    expect(summary(ptFile as unknown as { classRequestWizard: Tree })).toEqual(summary(enFile as unknown as { classRequestWizard: Tree }));
  });
});
