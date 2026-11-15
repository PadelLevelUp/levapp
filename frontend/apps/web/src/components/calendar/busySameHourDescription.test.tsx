/**
 * PAD-920 (classes.instance-enrollment rule 15): the class edit's failure toast (CalendarPage
 * handleEditClass) names each clash of a `409 busy_same_hour`, and keeps its own words otherwise.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { TFunction } from "i18next";
import { busySameHourDescription } from "./busySameHourDescription";

const t = ((key: string, p?: Record<string, unknown>) => (p ? `${key}:${JSON.stringify(p)}` : key)) as unknown as TFunction;
const clash = (name: string, title: string) => ({ playerId: "p", playerName: name, lessonInstanceId: 9, title, start: "2099-11-19T19:00:00" });

describe("PAD-920 the class edit's same-hour refusal", () => {
  it("[CLASSES-INSTANCE-ENROLLMENT-32] shows the clash line instead of the generic toast", () => {
    const err = { response: { status: 409, data: { code: "busy_same_hour", clashes: [clash("Rita", "Aula da Ana"), clash("Rui", "Avançado")] } } };
    const { getByTestId } = render(<>{busySameHourDescription(err, t, "pt")}</>);
    const lines = getByTestId("busy-same-hour-lines").textContent!.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"name":"Rita"');
    expect(lines[0]).toContain('"title":"Aula da Ana","date":"19/11","time":"19:00"');
    expect(busySameHourDescription({ response: { status: 500, data: {} } }, t, "pt")).toBeNull();
  });
});
