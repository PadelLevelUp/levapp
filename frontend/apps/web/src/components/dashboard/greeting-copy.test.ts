/**
 * PAD-419 (dashboard.blocks rule 3a): the dashboard greeting is a full salutation in both
 * languages. English said "Morning, {name}" / "Afternoon, {name}" / "Evening, {name}"; it reads
 * "Good morning / Good afternoon / Good evening, {name}". Web and iOS read the same keys
 * (`dashboard.greeting.<morning|afternoon|evening>` via `greetingKey()`), so this pins both.
 */
import { describe, expect, it } from "vitest";
import en from "../../../../../src/locales/en/dashboard.json";
import pt from "../../../../../src/locales/pt/dashboard.json";

describe("dashboard greeting copy (PAD-419)", () => {
  it("English greets with 'Good …, {{name}}' at every time of day", () => {
    expect(en.dashboard.greeting).toEqual({
      morning: "Good morning, {{name}}",
      afternoon: "Good afternoon, {{name}}",
      evening: "Good evening, {{name}}",
    });
  });

  it("Portuguese keeps 'Bom dia / Boa tarde / Boa noite, {{name}}'", () => {
    expect(pt.dashboard.greeting).toEqual({
      morning: "Bom dia, {{name}}",
      afternoon: "Boa tarde, {{name}}",
      evening: "Boa noite, {{name}}",
    });
  });
});
