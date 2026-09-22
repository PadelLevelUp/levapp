/**
 * evaluations.class-panel rules 1 and 10 (PAD-376): the primary "Avaliações" action on
 * the class detail. The state is the server's answer (`classEvaluationsAction`).
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ClassEvaluationsAction } from "./ClassEvaluationsAction";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("the 'Avaliações' action on the class detail", () => {
  it("renders nothing for a student, a non-class event or a class the coach does not own", () => {
    const { container } = render(<ClassEvaluationsAction state="hidden" onOpen={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("opens the panel when the occurrence can be rated", () => {
    const onOpen = vi.fn();
    render(<ClassEvaluationsAction state="available" onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("class-evaluations-open"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("class-eval-unavailable")).toBeNull();
  });

  it("is disabled with its one-line explanation for a past class that was never opened", () => {
    const onOpen = vi.fn();
    render(<ClassEvaluationsAction state="unavailable" onOpen={onOpen} />);
    const button = screen.getByTestId("class-evaluations-open") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId("class-eval-unavailable").textContent).toBe("players.classEvaluations.unavailable");
    expect(button.getAttribute("aria-describedby")).toBe(screen.getByTestId("class-eval-unavailable").id);
  });

  it("a read that failed for a reason other than 'not the owner' is an error with a retry, not a vanished action (review F2)", () => {
    const onRetry = vi.fn();
    render(<ClassEvaluationsAction state="error" onOpen={vi.fn()} onRetry={onRetry} />);
    expect(screen.queryByTestId("class-evaluations-open")).toBeNull();
    expect(screen.getByTestId("class-eval-error")).toBeTruthy();
    fireEvent.click(screen.getByTestId("class-eval-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("is disabled, without an explanation, while the server has not answered", () => {
    render(<ClassEvaluationsAction state="loading" onOpen={vi.fn()} />);
    expect((screen.getByTestId("class-evaluations-open") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("class-eval-unavailable")).toBeNull();
  });
});
