/**
 * evaluations.competencies rule 11 (PAD-373): one manager, opened over whatever page the
 * coach is on by a query flag, and closing it removes only that flag.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const auth = vi.hoisted(() => ({ roles: ["coach"] as string[] }));
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: { roles: auth.roles } }) }));
vi.mock("./CompetencyManager", () => ({
  CompetencyManager: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <button data-testid="stub-manager" onClick={onClose}>close</button> : null,
}));

import { CompetencyManagerHost } from "./CompetencyManagerHost";

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function at(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <CompetencyManagerHost />
      <Where />
    </MemoryRouter>,
  );
}

describe("CompetencyManagerHost", () => {
  it("opens on the flag and, on close, removes only the flag", () => {
    auth.roles = ["coach"];
    at("/settings?tab=preferences&competencies=open");

    fireEvent.click(screen.getByTestId("stub-manager"));

    expect(screen.getByTestId("where")).toHaveTextContent("/settings?tab=preferences");
    expect(screen.queryByTestId("stub-manager")).toBeNull();
  });

  it("stays closed without the flag", () => {
    auth.roles = ["coach"];
    at("/settings?tab=preferences");

    expect(screen.queryByTestId("stub-manager")).toBeNull();
  });

  it("is coach-only: a student with the flag in the URL gets nothing", () => {
    auth.roles = ["player"];
    at("/calendar?competencies=open");

    expect(screen.queryByTestId("stub-manager")).toBeNull();
  });
});
