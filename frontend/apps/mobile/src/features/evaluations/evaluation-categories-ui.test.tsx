/**
 * PAD-431 on iOS — the two small pieces the evaluation screens are built from:
 *  - settings.role-scope rule 3 (D8): Preferences holds the evaluation settings under one
 *    "Avaliações" heading, in order: categories, frequency, scale;
 *  - evaluations.competencies rule 15 (D7): on the entry form a category heads the
 *    sub-categories offered under it; a row scored directly has no heading.
 * The form's grouping itself is `formGroups` (packages/config, tested there); this pins the iOS
 * rendering of one group. testIDs and translation keys only (t returns the key).
 */
import * as React from "react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import type { EvaluationCompetency } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => {
  const translation = { t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key, i18n: { language: "pt" } };
  return { useTranslation: () => translation };
});
vi.mock("./competency-manager/competencies-settings-entry", async () => {
  const { View } = await import("react-native");
  return { CompetenciesSettingsEntry: () => createElement(View, { testID: "settings-competencies" }) };
});
vi.mock("./evaluation-reminder-setting", async () => {
  const { View } = await import("react-native");
  return { EvaluationReminderSetting: () => createElement(View, { testID: "evaluation-reminder-setting" }) };
});
vi.mock("./evaluation-scale-setting", async () => {
  const { View } = await import("react-native");
  return { EvaluationScaleSetting: () => createElement(View, { testID: "evaluation-scale-setting" }) };
});

import { EvaluationSettingsGroup } from "./evaluation-settings-group";
import { EvaluationFormGroupView } from "./evaluation-form-group";

function competency(over: Partial<EvaluationCompetency>): EvaluationCompetency {
  return { id: 1, key: null, name: "x", group: "custom", scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0, ...over };
}

describe("EvaluationSettingsGroup on iOS (PAD-431)", () => {
  it("holds the categories, the frequency and the scale under one heading, in that order", async () => {
    const n = await renderNative(createElement(EvaluationSettingsGroup));
    const group = n.byTestId("settings-evaluations");
    expect(n.byTestId("settings-evaluations-title").props.children).toBe("evaluations.settingsGroupTitle");
    const ids = group
      .findAll((node) => typeof node.props.testID === "string" && node.props.testID !== "settings-evaluations-title" && node !== group)
      .map((node) => node.props.testID as string)
      .filter((id, i, all) => all.indexOf(id) === i);
    expect(ids).toEqual(["settings-competencies", "evaluation-reminder-setting", "evaluation-scale-setting"]);
  });
});

describe("EvaluationFormGroupView on iOS (PAD-431)", () => {
  // A plain View per row: the rows' own rendering is the form's, not under test here.
  const renderRow = (row: EvaluationCompetency) => createElement(View, { key: row.id, testID: `evaluation-row-${row.id}` });

  it("a category heads the sub-categories offered under it", async () => {
    const technique = competency({ id: 10, key: "technique", name: "Técnica", group: "general" });
    const vibora = competency({ id: 11, key: "vibora", name: "Víbora", group: "technique", parentId: 10 });
    const n = await renderNative(createElement(EvaluationFormGroupView, { group: { category: technique, rows: [vibora] }, renderRow }));
    const group = n.byTestId("evaluation-group-10");
    expect(group.findAll((node) => node.props.testID === "evaluation-row-11").length).toBeGreaterThan(0);
    expect(n.byTestId("evaluation-group-title-10").props.children).toBe("Técnica");
  });

  it("rows scored directly render with no heading", async () => {
    const consistency = competency({ id: 12, key: "consistency", name: "Consistência", group: "general" });
    const n = await renderNative(createElement(EvaluationFormGroupView, { group: { category: null, rows: [consistency] }, renderRow }));
    expect(n.queryByTestId("evaluation-row-12")).not.toBeNull();
    expect(n.root.root.findAll((node) => String(node.props.testID ?? "").startsWith("evaluation-group-")).length).toBe(0);
  });
});
