/**
 * PAD-481 (eligibility.rules rule 6) on web: the direction selector under "within N levels" saves
 * the direction AS the operation, keeping N. The mapping is unit-tested in @levelup/config
 * level-direction.test.ts; this pins the wiring from the Select to `onChange`. The Select is a
 * stand-in that keeps the contract the section relies on (value in, onValueChange(value) out).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  type Ctx = { value?: string; onValueChange?: (v: string) => void };
  const SelectCtx = React.createContext<Ctx>({});
  return {
    Select: ({ value, onValueChange, children }: Ctx & { children: React.ReactNode }) => (
      <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>
    ),
    SelectTrigger: ({ "data-testid": testId, children }: { "data-testid"?: string; children: React.ReactNode }) => {
      const ctx = React.useContext(SelectCtx);
      return <div data-testid={testId} data-value={ctx.value}>{children}</div>;
    },
    SelectValue: () => <span>{React.useContext(SelectCtx).value}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children, "data-testid": testId }: { value: string; children: React.ReactNode; "data-testid"?: string }) => {
      const ctx = React.useContext(SelectCtx);
      return <button type="button" data-testid={testId} onClick={() => ctx.onValueChange?.(value)}>{children}</button>;
    },
  };
});

import { EligibilitySection } from "./EligibilitySection";

const rule = (operation: string, value = 2) => ({ attribute: "level", operation, value });

describe("direction of within N levels (PAD-481)", () => {
  it("shows the stored direction, both for a bar set before PAD-481", () => {
    render(<EligibilitySection rules={[rule("within_n_of_class")]} onChange={() => {}} />);
    expect(screen.getByTestId("eligibility-direction").getAttribute("data-value")).toBe("both");
  });

  it.each([
    ["above", "within_n_above_class"],
    ["below", "within_n_below_class"],
  ])("picking %s saves %s with N kept", (direction, operation) => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[rule("within_n_of_class")]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId(`eligibility-direction-${direction}`));
    expect(onChange).toHaveBeenCalledWith([rule(operation)]);
  });

  it("picking both on a one-way bar saves within_n_of_class with N kept", () => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[rule("within_n_below_class", 3)]} onChange={onChange} />);
    expect(screen.getByTestId("eligibility-direction").getAttribute("data-value")).toBe("below");
    fireEvent.click(screen.getByTestId("eligibility-direction-both"));
    expect(onChange).toHaveBeenCalledWith([rule("within_n_of_class", 3)]);
  });

  it("re-picking 'within N levels' from the operation menu keeps the direction", () => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[rule("within_n_above_class")]} onChange={onChange} />);
    fireEvent.click(screen.getByText("settings.eligibility.operations.withinNOfClass"));
    expect(onChange).toHaveBeenCalledWith([rule("within_n_above_class")]);
  });
});

describe("a rule with no value (eligibility.rules rule 13)", () => {
  it("[ELIGIBILITY-RULES-19] marks a rule with no value", () => {
    const { rerender } = render(
      <EligibilitySection
        rules={[
          { attribute: "unjustified_absences", operation: "less_than" },
          { attribute: "level", operation: "within_n_of_class" },
          { attribute: "level", operation: "same_as_class" },
          { attribute: "attendance_rate", operation: "greater_than", value: 0 },
          { attribute: "justified_absences", operation: "equals", value: "2" as unknown as number },
        ]}
        onChange={() => {}}
      />,
    );
    const rows = screen.getAllByTestId("eligibility-rule-row");
    const marked = rows.map((r) => r.querySelector('[data-testid="eligibility-value-missing"]')?.textContent ?? null);
    expect(marked).toEqual(["settings.eligibility.valueMissing", "settings.eligibility.valueMissing", null, null, null]);
    expect(rows[0].getAttribute("data-value-missing")).toBe("true");

    rerender(<EligibilitySection rules={[{ attribute: "unjustified_absences", operation: "less_than", value: 1 }]} onChange={() => {}} />);
    expect(screen.queryByTestId("eligibility-value-missing")).toBeNull();
  });
});

describe("the editor keeps a rule well-formed as the coach changes it (eligibility.rules rule 11)", () => {
  const same = { attribute: "level", operation: "same_as_class" };
  const absences = { attribute: "unjustified_absences", operation: "less_than", value: 3 };
  const rowsOf = () => screen.getAllByTestId("eligibility-rule-row");

  it("[ELIGIBILITY-RULES-15] adding a rule appends level same_as_class with no value", () => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[same, absences]} onChange={onChange} />);
    fireEvent.click(screen.getByText("settings.eligibility.addRule"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(3);
    expect(next.slice(0, 2)).toEqual([same, absences]);
    expect(next[2]).toEqual({ attribute: "level", operation: "same_as_class" });
    expect(next[2].value).toBeUndefined();
  });

  it("[ELIGIBILITY-RULES-15] a change of attribute resets the operation and drops the value", () => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[same, absences]} onChange={onChange} />);
    fireEvent.click(within(rowsOf()[1]).getByText("settings.eligibility.attributes.attendanceRate"));
    const next = onChange.mock.calls[0][0];
    expect(next[0]).toEqual(same);
    expect(next[1]).toEqual({ attribute: "attendance_rate", operation: "greater_than" });
    expect(next[1].value).toBeUndefined();
  });

  it("[ELIGIBILITY-RULES-15] a change of operation keeps the value when the new operation takes one", () => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[same, absences]} onChange={onChange} />);
    fireEvent.click(within(rowsOf()[1]).getByText("settings.eligibility.operations.atMost"));
    expect(onChange).toHaveBeenCalledWith([same, { attribute: "unjustified_absences", operation: "less_than_or_equal", value: 3 }]);
  });

  it("[ELIGIBILITY-RULES-15] a change of operation drops the value when the new operation takes none", () => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[rule("within_n_of_class", 2)]} onChange={onChange} />);
    fireEvent.click(screen.getByText("settings.eligibility.operations.equalOrAboveClass"));
    const next = onChange.mock.calls[0][0];
    expect(next).toEqual([{ attribute: "level", operation: "equal_or_above_class" }]);
    expect(next[0].value).toBeUndefined();
  });

  it("[ELIGIBILITY-RULES-15] removing one rule leaves the other", () => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[same, absences]} onChange={onChange} />);
    fireEvent.click(within(rowsOf()[0]).getByLabelText("settings.eligibility.removeRule"));
    expect(onChange).toHaveBeenCalledWith([absences]);
  });

  it("[ELIGIBILITY-RULES-15] removing the last rule stores null", () => {
    const onChange = vi.fn();
    render(<EligibilitySection rules={[same]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("settings.eligibility.removeRule"));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
