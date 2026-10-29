/**
 * PAD-787 (attendance.validation rule 8b, B-705): when the walk-in search lists nobody, it says
 * why: the typed name is someone already in the class (with "Show", which brings their row into
 * view), or nobody on the coach's roster (with a link to the players list).
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import type { PendingValidationClass } from "@/types";
import { ValidateClassesDialog } from "./ValidateClassesDialog";

const Dialog = ValidateClassesDialog as unknown as ComponentType<Record<string, unknown>>;

vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}:${opts.name}` : key),
    i18n: { language: "en" },
  }),
}));

const scrolled: string[] = [];
beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
    scrolled.push(this.dataset.testid ?? "");
  };
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

const klass: PendingValidationClass = {
  lessonInstanceId: 1,
  calendarEventId: "lessoninstance-1",
  title: "First",
  type: "academy",
  color: null,
  startDatetime: "2026-09-01T11:00:00",
  date: "2026-09-01",
  unanswered: 0,
  ready: true,
  players: [
    {
      presenceId: 10,
      playerId: 10,
      name: "Gonçalo Simões",
      response: "confirmed",
      status: null,
      justification: null,
      validated: false,
      lateCancellation: false,
      guest: false,
    },
  ],
};

function openSearch() {
  render(
    <MemoryRouter>
      <Dialog
        pending={[klass]}
        validated={[]}
        pendingCount={1}
        weekOffset={0}
        onWeekChange={() => {}}
        roster={[
          { id: 10, name: "Gonçalo Simões", nickname: "Gugu" },
          { id: 91, name: "Zé Costa" },
        ]}
        onValidate={vi.fn()}
        onUnvalidate={vi.fn()}
      />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByTestId("presences-validate-trigger"));
  fireEvent.click(screen.getByText("presences.validate.addPlayer"));
  return (value: string) => fireEvent.change(screen.getByTestId("presences-walk-in-search"), { target: { value } });
}

describe("the walk-in search says why nobody is offered (PAD-787)", () => {
  it("names a student already in the class, by real name or nickname, and shows their row", () => {
    const type = openSearch();
    type("goncalo simoes");
    expect(screen.getByTestId("presences-walk-in-already")).toHaveTextContent(
      "presences.validate.alreadyInClass:Gonçalo Simões"
    );
    type("Gugu");
    expect(screen.getByTestId("presences-walk-in-already")).toBeInTheDocument();
    scrolled.length = 0;
    fireEvent.click(screen.getByTestId("presences-walk-in-show"));
    expect(scrolled).toEqual(["validate-list-row-1-10"]);
    expect(screen.queryByTestId("presences-walk-in-search")).toBeNull();
  });

  it("says a name nobody has is not on the roster, with a link to the players list", () => {
    const type = openSearch();
    type("Xavier");
    expect(screen.getByTestId("player-search-empty")).toBeInTheDocument();
    expect(screen.getByTestId("presences-walk-in-not-on-roster")).toHaveTextContent("presences.validate.notOnRoster");
    expect(screen.getByTestId("presences-walk-in-open-players")).toHaveAttribute("href", "/players");
    expect(screen.queryByTestId("presences-walk-in-already")).toBeNull();
  });

  it("explains nothing while the search lists someone or is blank", () => {
    const type = openSearch();
    type("ze");
    expect(screen.getByTestId("presences-walk-in-option-91")).toBeInTheDocument();
    expect(screen.queryByTestId("presences-walk-in-already")).toBeNull();
    expect(screen.queryByTestId("presences-walk-in-not-on-roster")).toBeNull();
    type("");
    expect(screen.queryByTestId("presences-walk-in-not-on-roster")).toBeNull();
  });
});
