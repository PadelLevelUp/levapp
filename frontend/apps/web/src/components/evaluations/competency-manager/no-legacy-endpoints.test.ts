import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// PAD-373 "done when": the competency manager calls NONE of the legacy evaluation
// endpoints. They are frozen for the App Store builds (R-047) and pinned by
// test_pad362_evaluation_contract.py; a new client that wrote through them would fork a
// renamed category (B-125) and bypass the catalogue rules.

const FRONTEND = resolve(__dirname, "../../../../../..");
const FOLDERS = [
  "apps/web/src/components/evaluations/competency-manager",
  "apps/mobile/src/features/evaluations/competency-manager",
];
const FILES = ["apps/mobile/app/competencies.tsx", "packages/hooks/src/evaluations.ts"];

const LEGACY = [
  /\/app\/evaluation_categories\b/,
  /add_evaluation_categories/,
  /delete\/evaluation_category/,
  /\/app\/evaluation_category\//,
  /add_evaluation_entry/,
  /resources\/evaluation["']/,                       // the legacy client module (not evaluationRecords)
  /\b(getEvaluationCategories|addEvaluationCategories|deleteEvaluationCategory|getEvaluationCategoryImpact)\b/,
];

function sources(): string[] {
  const inFolders = FOLDERS.filter((folder) => existsSync(join(FRONTEND, folder))).flatMap((folder) =>
    readdirSync(join(FRONTEND, folder))
      .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
      .map((name) => join(folder, name)));
  return [...inFolders, ...FILES.filter((file) => existsSync(join(FRONTEND, file)))];
}

describe("the competency manager and the legacy evaluation endpoints", () => {
  it("finds the manager's sources on web and the shared hooks before judging them", () => {
    const found = sources();

    expect(found).toContain("apps/web/src/components/evaluations/competency-manager/CompetencyManager.tsx");
    expect(found).toContain("apps/web/src/components/evaluations/competency-manager/CompetencyRow.tsx");
    expect(found).toContain("apps/web/src/components/evaluations/competency-manager/DeleteCompetencyDialog.tsx");
    expect(found).toContain("packages/hooks/src/evaluations.ts");
    expect(found).toContain("apps/mobile/src/features/evaluations/competency-manager/competency-manager-screen.tsx");
    expect(found).toContain("apps/mobile/src/features/evaluations/competency-manager/competency-row.tsx");
    expect(found).toContain("apps/mobile/src/features/evaluations/competency-manager/delete-competency-dialog.tsx");
    expect(found).toContain("apps/mobile/app/competencies.tsx");
  });

  it("calls none of them, and imports no legacy client function", () => {
    const offenders = sources().flatMap((file) => {
      const text = readFileSync(join(FRONTEND, file), "utf8");
      return LEGACY.filter((pattern) => pattern.test(text)).map((pattern) => `${file}: ${pattern}`);
    });

    expect(offenders).toEqual([]);
  });

  it("would catch each one: every pattern matches the line of legacy client code it stands for", () => {
    // Kept inline so this control never goes vacuous when the old editor file is deleted.
    const samples = [
      'await getApi().get("/app/evaluation_categories");',
      'await getApi().post("/app/add_evaluation_categories", data);',
      'await getApi().post("/app/delete/evaluation_category", { id });',
      'await getApi().get(`/app/evaluation_category/${id}/impact`);',
      'await getApi().post("/app/add_evaluation_entry", body);',
      'import { x } from "@levelup/api/src/resources/evaluation";',
      "import { deleteEvaluationCategory, getEvaluationCategoryImpact } from \"@/api/evaluation\";",
    ];

    expect(samples).toHaveLength(LEGACY.length);
    samples.forEach((sample, index) => expect(LEGACY[index].test(sample), sample).toBe(true));
    // …and the v2 client the manager does use matches none of them.
    const v2 = 'await getApi().patch(`/app/evaluation_competency/${id}`, patch); import * as api from "@levelup/api/src/resources/evaluationRecords";';
    expect(LEGACY.filter((pattern) => pattern.test(v2))).toEqual([]);
  });
});
