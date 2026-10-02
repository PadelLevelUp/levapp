/**
 * PAD-481 (eligibility.rules rule 6) on web: the direction selector under "within N levels" saves
 * the direction AS the operation, keeping N. The mapping is unit-tested in @levelup/config
 * level-direction.test.ts; this pins the wiring from the Select to `onChange`. The Select is a
 * stand-in that keeps the contract the section relies on (value in, onValueChange(value) out).
 */
import { fireEvent, render, screen } from "@testing-library/react";
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
