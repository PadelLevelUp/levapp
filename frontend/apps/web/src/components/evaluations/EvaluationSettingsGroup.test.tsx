/**
 * settings.role-scope rule 3 (PAD-431, D8): Settings → Preferences holds the coach's evaluation
 * settings under one "Avaliações" heading, in this order: the categories, the frequency, the scale.
 * Asserted by test id and translation key (t returns the key), never by copy.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("react-i18next", () => {
  const translation = { t: (key: string) => key, i18n: { language: "pt" } };
  return { useTranslation: () => translation };
});
vi.mock("./competency-manager/CompetenciesSettingsEntry", () => ({
  CompetenciesSettingsEntry: () => <div data-testid="settings-competencies" />,
}));
vi.mock("./EvaluationReminderSetting", () => ({
  EvaluationReminderSetting: () => <div data-testid="evaluation-reminder-setting" />,
}));
vi.mock("./EvaluationScaleSetting", () => ({
  EvaluationScaleSetting: () => <div data-testid="evaluation-scale-setting" />,
}));

import { EvaluationSettingsGroup } from "./EvaluationSettingsGroup";

describe("EvaluationSettingsGroup (PAD-431)", () => {
  it("holds the categories, the frequency and the scale under one heading, in that order", () => {
    render(<EvaluationSettingsGroup />);
    const group = screen.getByTestId("settings-evaluations");
    expect(within(group).getByTestId("settings-evaluations-title")).toHaveTextContent("evaluations.settingsGroupTitle");
    const order = Array.from(group.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid"))
      .filter((id) => id !== "settings-evaluations-title");
    expect(order).toEqual(["settings-competencies", "evaluation-reminder-setting", "evaluation-scale-setting"]);
  });
});
