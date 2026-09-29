/**
 * PAD-431 on iOS (evaluations.competencies rule 15, D7): the entry form itself renders its rows
 * grouped: a category heads the sub-categories offered under it, and a row scored directly has no
 * heading. `formGroups` is tested in packages/config and one group's view in
 * evaluation-categories-ui.test.tsx; this pins that `EvaluationForm` actually uses them
 * (evaluation-form.tsx, the `formGroups(rows, competencies)` render). The session hook, the inputs
 * and the toast are stubbed: the form's grouping is under test, not its saving.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { EvaluationCompetency } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => {
  const translation = { t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key, i18n: { language: "pt" } };
  return { useTranslation: () => translation };
});
vi.mock("@levelup/hooks", () => ({
  useEvaluationFormSession: () => ({
    session: { rate: vi.fn(), step: vi.fn(), editNote: vi.fn(), flush: vi.fn(), retryNote: vi.fn() },
    state: { scores: {}, note: "", noteUnsaved: false, failure: null },
  }),
}));
vi.mock("@expo/vector-icons", async () => {
  const { View } = await import("react-native");
  return { Ionicons: () => createElement(View) };
});
vi.mock("@/components/ui/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("./use-flush-on-background", () => ({ useFlushOnBackground: () => undefined }));
vi.mock("./star-rating", async () => {
  const { View } = await import("react-native");
  return { StarRating: () => createElement(View) };
});
vi.mock("./score-slider", async () => {
  const { View } = await import("react-native");
  return { ScoreSlider: () => createElement(View) };
});
vi.mock("./score-stepper", async () => {
  const { View } = await import("react-native");
  return { ScoreStepper: () => createElement(View) };
});

import { EvaluationForm } from "./evaluation-form";

function competency(over: Partial<EvaluationCompetency>): EvaluationCompetency {
  return { id: 1, key: null, name: "x", group: "custom", scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0, ...over };
}

describe("EvaluationForm on iOS groups its rows (PAD-431)", () => {
  const technique = competency({ id: 10, key: "technique", name: "Técnica", group: "general" });
  const vibora = competency({ id: 11, key: "vibora", name: "Víbora", group: "technique", parentId: 10 });
  const consistency = competency({ id: 12, key: "consistency", name: "Consistência", group: "general" });

  async function renderForm() {
    return renderNative(
      createElement(EvaluationForm, {
        competencies: [technique, vibora, consistency],
        record: null,
        onSave: vi.fn(),
        onClose: vi.fn(),
        onManageCompetencies: vi.fn(),
      })
    );
  }

  it("Técnica heads Víbora, and is not itself a row to score", async () => {
    const n = await renderForm();
    const group = n.byTestId("evaluation-group-10");
    expect(n.byTestId("evaluation-group-title-10").props.children).toBe("Técnica");
    expect(group.findAll((node) => node.props.testID === "evaluation-row-11").length).toBeGreaterThan(0);
    expect(n.queryByTestId("evaluation-row-10")).toBeNull();
  });

  it("Consistência, scored directly, sits under no heading", async () => {
    const n = await renderForm();
    expect(n.queryByTestId("evaluation-row-12")).not.toBeNull();
    const headed = n.root.root.findAll((node) => String(node.props.testID ?? "").startsWith("evaluation-group-") && !String(node.props.testID).startsWith("evaluation-group-title-"));
    // The renderer lists a composite and its host node under one testID: compare the distinct ids.
    expect([...new Set(headed.map((g) => g.props.testID))]).toEqual(["evaluation-group-10"]);
    expect(headed[0].findAll((node) => node.props.testID === "evaluation-row-12").length).toBe(0);
  });
});
