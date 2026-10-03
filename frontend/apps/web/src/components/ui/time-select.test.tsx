/**
 * PAD-508 (classes.create rule 8b): the desktop class-time field. It always holds a valid
 * HH:MM — the ticket's "the time reverts to zero after a while" cannot happen — offers a
 * 15-minute list, and takes free typing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { TimeSelect, endAfterStartMove, parseTime } from "./time-select";

afterEach(() => {
  cleanup();
});

function Harness({ initial = "09:00", from, onChange }: { initial?: string; from?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <TimeSelect
      data-testid="t"
      aria-label="Hora"
      value={value}
      from={from}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const field = () => screen.getByTestId("t") as HTMLInputElement;

describe("parseTime", () => {
  it.each([["9", "09:00"], ["930", "09:30"], ["0930", "09:30"], ["9:30", "09:30"], ["9h30", "09:30"], ["21.15", "21:15"], [" 7 ", "07:00"], ["2359", "23:59"]])("%s → %s", (input, out) => {
    expect(parseTime(input)).toBe(out);
  });
  it.each(["", "abc", "25", "2460", "9:7", "12345", "9:30pm"])("%s → null", (input) => {
    expect(parseTime(input)).toBeNull();
  });
});

describe("the time never empties and never falls back to zero (PAD-508 criterion)", () => {
  it("a cleared field puts the last valid time back when the coach leaves it", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());
    expect(field().value).toBe("09:00");
    expect(onChange).not.toHaveBeenCalledWith("");
    expect(onChange).not.toHaveBeenCalledWith("00:00");
  });

  it("typing with the list closed, then leaving the field, saves the typed time", () => {
    // #544 review: after Escape (or Enter, or a pick) the list is closed and the field keeps focus;
    // typing and then Tab or a click elsewhere must still commit.
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(field());
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByTestId("t-list")).toBeNull();
    fireEvent.change(field(), { target: { value: "1930" } });
    fireEvent.blur(field());
    expect(onChange).toHaveBeenLastCalledWith("19:30");
    expect(field().value).toBe("19:30");
  });

  it("text that is not a time goes back to the last valid one", () => {
    const onChange = vi.fn();
    render(<Harness initial="18:00" onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "abc" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("18:00");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("typed text is read as a time", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(field(), { target: { value: "1930" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("19:30");
    expect(field().value).toBe("19:30");
  });
});

describe("the list", () => {
  it("offers every quarter hour from 06:00 to 23:45, with the current time selected", () => {
    render(<Harness />);
    fireEvent.click(field());
    const list = screen.getByTestId("t-list");
    const options = within(list).getAllByRole("button");
    expect(options).toHaveLength(72);
    expect(options[0].textContent).toBe("06:00");
    expect(options[71].textContent).toBe("23:45");
    expect(list.querySelector("[data-selected=true]")?.textContent).toBe("09:00");
  });

  it("choosing an option sets it and closes the list", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(field());
    fireEvent.click(within(screen.getByTestId("t-list")).getByText("18:30"));
    expect(onChange).toHaveBeenCalledWith("18:30");
    expect(field().value).toBe("18:30");
    expect(screen.queryByTestId("t-list")).toBeNull();
  });

  it("the end list starts after the start and shows each option's duration", () => {
    render(<Harness initial="19:30" from="18:00" />);
    fireEvent.click(field());
    const options = within(screen.getByTestId("t-list")).getAllByRole("button");
    expect(options[0].textContent).toBe("18:1515 min");
    const byTime = (t: string) => options.find((o) => o.textContent?.startsWith(t))!;
    expect(byTime("19:00").textContent).toBe("19:001 h");
    expect(byTime("19:30").textContent).toBe("19:301 h 30 min");
  });
});

describe("endAfterStartMove (classes.edit rule 7b)", () => {
  it.each([
    ["09:00", "10:30", "08:00", "10:30"], // still after the new start: unchanged
    ["09:00", "10:30", "10:30", "12:00"], // reached: keeps the 1 h 30 length
    ["09:00", "10:30", "11:00", "12:30"],
    ["09:00", "09:00", "09:30", "10:30"], // no length: an hour
    ["21:00", "23:00", "23:00", "23:59"], // never past the day
  ])("%s–%s, start to %s → end %s", (start, end, next, out) => {
    expect(endAfterStartMove(start, end, next)).toBe(out);
  });
});
