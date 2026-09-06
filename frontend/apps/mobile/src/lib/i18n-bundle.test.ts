import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { roleLabelKey } from "@/features/messages/utils";

/**
 * Guards the mobile i18n static-import trap (PAD-158).
 *
 * Web loads `src/locales/**` with `import.meta.glob`; Metro has no equivalent, so
 * `src/lib/i18n.ts` names every namespace by hand, twice (en and pt). A key added to
 * only one tree, or a namespace added to only one array, renders the raw key path on a
 * device and nothing anywhere else complains — no typecheck sees it, and screens are
 * not unit-testable here. These assertions are the only automated check that exists.
 *
 * `i18n.ts` itself is not imported: it pulls expo-localization, which needs the native
 * runtime. The file is read as text and its import list parsed instead — that is the
 * artefact under test, so reading it is the point rather than a workaround.
 */

const i18nPath = path.resolve(__dirname, "i18n.ts");
const localesDir = path.resolve(__dirname, "../../../../src/locales");

const source = fs.readFileSync(i18nPath, "utf-8");

/** Namespaces `i18n.ts` statically imports, per language. */
function importedNamespaces(lang: "en" | "pt"): string[] {
  const re = new RegExp(
    String.raw`import\s+\w+\s+from\s+"[^"]*\/locales\/${lang}\/([A-Za-z0-9_]+)\.json"`,
    "g"
  );
  return [...source.matchAll(re)].map((m) => m[1]).sort();
}

/** Contents of the `enNamespaces` / `ptNamespaces` arrays, as identifier lists. */
function bundledIdentifiers(lang: "en" | "pt"): string[] {
  const name = lang === "en" ? "enNamespaces" : "ptNamespaces";
  const block = source.match(
    new RegExp(String.raw`const ${name}: Dict\[\] = \[(.*?)\n\];`, "s")
  );
  expect(block, `${name} array not found in i18n.ts`).not.toBeNull();
  return block![1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function flatten(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k)
  );
}

function loadTree(lang: "en" | "pt"): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const ns of importedNamespaces(lang)) {
    const raw = fs.readFileSync(
      path.join(localesDir, lang, `${ns}.json`),
      "utf-8"
    );
    const parsed = JSON.parse(raw);
    for (const key of flatten(parsed)) {
      // flatten() returns leaf paths; re-walk to get the value.
      let node: unknown = parsed;
      for (const part of key.split(".")) {
        node = (node as Record<string, unknown>)[part];
      }
      merged[key] = node as string;
    }
  }
  return merged;
}

const en = loadTree("en");
const pt = loadTree("pt");

describe("mobile i18n bundle", () => {
  it("imports the same namespaces for both languages", () => {
    expect(importedNamespaces("pt")).toEqual(importedNamespaces("en"));
  });

  it("wires every imported namespace into its Namespaces array", () => {
    for (const ns of importedNamespaces("en")) {
      expect(bundledIdentifiers("en")).toContain(`${ns}En`);
      expect(bundledIdentifiers("pt")).toContain(`${ns}Pt`);
    }
    // and nothing is in an array that was never imported
    expect(bundledIdentifiers("en")).toHaveLength(
      importedNamespaces("en").length
    );
    expect(bundledIdentifiers("pt")).toHaveLength(
      importedNamespaces("pt").length
    );
  });

  it("has the same key set in en and pt across every bundled namespace", () => {
    const enOnly = Object.keys(en).filter((k) => !(k in pt));
    const ptOnly = Object.keys(pt).filter((k) => !(k in en));
    expect({ enOnly, ptOnly }).toEqual({ enOnly: [], ptOnly: [] });
  });

  it("resolves every key roleLabelKey can return, in both languages", () => {
    // The role→key map is module-private in `messages/utils.ts`, so the roles
    // are read out of its source rather than exported purely for this test —
    // an export would collide with PAD-157, which is rewriting that file. The
    // keys themselves still come from calling the real `roleLabelKey`.
    const utilsSource = fs.readFileSync(
      path.resolve(__dirname, "../features/messages/utils.ts"),
      "utf-8"
    );
    const map = utilsSource.match(
      /const ROLE_LABEL_KEYS: Record<string, string> = \{(.*?)\n\};/s
    );
    expect(map, "ROLE_LABEL_KEYS not found in messages/utils.ts").not.toBeNull();
    const roles = [...map![1].matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map(
      (m) => m[1]
    );
    expect(roles.length).toBeGreaterThan(0);

    for (const role of roles) {
      const key = roleLabelKey(role);
      expect(key, `roleLabelKey("${role}") returned null`).not.toBeNull();
      expect(typeof en[key!], `${key} missing from en`).toBe("string");
      expect(typeof pt[key!], `${key} missing from pt`).toBe("string");
    }
  });

  it("bundles the attendance namespace the history screen renders (PAD-162)", () => {
    // The screen ported in PAD-162 was the first mobile consumer of this
    // namespace. Without the static import it renders "attendance.title" et al
    // as literal key paths and nothing else fails — which is exactly the trap
    // this file exists for, so the namespace is named here rather than left to
    // the generic parity check above (which passes when a namespace is in
    // NEITHER language).
    expect(importedNamespaces("en")).toContain("attendance");
    expect(importedNamespaces("pt")).toContain("attendance");

    for (const key of [
      "attendance.title",
      "attendance.subtitleOwn",
      "attendance.subtitleOther",
      "attendance.backToPlayer",
      "attendance.backToDashboard",
      "attendance.playerLink",
      "attendance.total_one",
      "attendance.total_other",
      "attendance.chart.title",
      "attendance.chart.seriesLabel",
      "attendance.chart.empty",
      "attendance.chart.error",
      "attendance.history.title",
      "attendance.history.empty",
      "attendance.history.openClass",
      "attendance.ranges.week",
      "attendance.ranges.month",
      "attendance.ranges.year",
      "attendance.ranges.custom",
      "attendance.ranges.weekAria",
      "attendance.ranges.monthAria",
      "attendance.ranges.yearAria",
      "attendance.ranges.customAria",
      "attendance.ranges.from",
      "attendance.ranges.to",
      "attendance.ranges.apply",
      "attendance.ranges.clear",
      "attendance.ranges.invalid",
    ]) {
      expect(typeof en[key], `${key} missing from en`).toBe("string");
      expect(typeof pt[key], `${key} missing from pt`).toBe("string");
    }

    // The interpolated strings must carry their placeholders, or the coach's
    // subtitle loses the player's name and a history row loses its date.
    expect(en["attendance.subtitleOther"]).toContain("{{name}}");
    expect(pt["attendance.subtitleOther"]).toContain("{{name}}");
    for (const lang of [en, pt]) {
      expect(lang["attendance.history.openClass"]).toContain("{{title}}");
      expect(lang["attendance.history.openClass"]).toContain("{{date}}");
    }
  });

  it("bundles the absences namespace the Faltas screen renders (PAD-163)", () => {
    // Same trap as the attendance check above: without the static import the
    // screen renders "absences.title" et al as literal key paths.
    expect(importedNamespaces("en")).toContain("absences");
    expect(importedNamespaces("pt")).toContain("absences");

    for (const key of [
      "absences.title",
      "absences.subtitleOwn",
      "absences.subtitleOther",
      "absences.backToPlayer",
      "absences.backToDashboard",
      "absences.playerLink",
      "absences.total_one",
      "absences.total_other",
      "absences.chart.title",
      "absences.history.title",
      "absences.history.empty",
      "absences.justified",
      "absences.unjustified",
    ]) {
      expect(typeof en[key], `${key} missing from en`).toBe("string");
      expect(typeof pt[key], `${key} missing from pt`).toBe("string");
    }

    expect(en["absences.subtitleOther"]).toContain("{{name}}");
    expect(pt["absences.subtitleOther"]).toContain("{{name}}");
  });

  it("resolves the strings the class-detail recurrence line renders", () => {
    // Was a hardcoded English `" · until "` template literal before PAD-158.
    for (const key of [
      "calendar.detail.recurringClass",
      "calendar.detail.recurringClassUntil",
    ]) {
      expect(typeof en[key], `${key} missing from en`).toBe("string");
      expect(typeof pt[key], `${key} missing from pt`).toBe("string");
    }
    // The interpolated variant must actually carry the placeholder, or the end
    // date silently disappears from the line.
    expect(en["calendar.detail.recurringClassUntil"]).toContain("{{date}}");
    expect(pt["calendar.detail.recurringClassUntil"]).toContain("{{date}}");
  });
});
