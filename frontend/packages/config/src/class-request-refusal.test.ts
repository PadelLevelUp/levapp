import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { classRequestRefusalLines } from "./class-request-refusal";

const LOCALES = path.resolve(__dirname, "../../../src/locales");

/** The real words: the key looked up in the locale files both shells load, its {{params}} filled. */
function words(lang: "pt" | "en", key: string, params: Record<string, unknown> = {}): string {
  const [ns, ...rest] = key.split(".");
  let node: unknown = JSON.parse(fs.readFileSync(path.join(LOCALES, lang, `${ns}.json`), "utf8"))[ns];
  for (const part of rest) node = (node as Record<string, unknown> | undefined)?.[part];
  expect(typeof node, `${lang} has ${key}`).toBe("string");
  return (node as string).replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? ""));
}

const refused = {
  response: {
    status: 409,
    data: {
      code: "busy_same_hour",
      message: "busy same hour",
      clashes: [{ playerId: 7, playerName: "Ana", lessonInstanceId: 3, title: "Ana 11:00", start: "2026-11-16T11:00:00" }],
    },
  },
};

describe("classRequestRefusalLines (classes.class-requests rule 4a, B-729)", () => {
  it("[CLASSES-CLASS-REQUESTS-40] reads one line per clash for the coach and for the student, in pt and en", () => {
    const coach = classRequestRefusalLines(refused, "coach", "pt");
    const student = classRequestRefusalLines(refused, "student", "pt");
    expect(coach).toHaveLength(1);
    expect(student).toHaveLength(1);
    const pt = (lines: typeof coach) => words("pt", lines![0].key, lines![0].params);
    const en = (lines: typeof coach) => words("en", lines![0].key, lines![0].params);
    expect(pt(coach)).toContain("Ana já está inscrito noutra aula à mesma hora (Ana 11:00");
    expect(pt(coach)).toContain("Remove-o dessa aula primeiro");
    expect(pt(student)).toContain("Ana já está inscrito noutra aula à mesma hora (Ana 11:00");
    expect(pt(student)).not.toContain("Remove-o");
    expect(en(coach)).toContain("Ana is already in another class at the same time (Ana 11:00");
    expect(en(student)).toContain("Ana is already in another class at the same time (Ana 11:00");
    expect(en(student)).not.toMatch(/Remove them/i);
    expect(pt(student)).toContain("11:00");
  });

  it("[CLASSES-CLASS-REQUESTS-40] gives no lines for any other refusal", () => {
    expect(classRequestRefusalLines({ response: { status: 409, data: { code: "slot_taken" } } }, "coach", "pt")).toBeNull();
    expect(classRequestRefusalLines(new Error("network"), "student", "en")).toBeNull();
  });
});
