/**
 * PAD-551 — classes.instance-enrollment rule 13: the coach sets a player's side for this
 * occurrence from the participant row ("Habitual" / "Esquerdo" / "Direito"); a row whose side is
 * set here shows "Esquerdo/Direito nesta aula". Shown only when the server says it is editable.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Player } from "@/types";
import { AttendanceRow } from "./AttendanceRow";

// PAD-660: these tests are about something else; the coach's resolver answers the real name.
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: () => (_id: unknown, real: string | null | undefined) => real ?? "",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const player = { id: "7", user: { name: "Ana Lopes" } } as unknown as Player;

function row(side: Partial<React.ComponentProps<typeof AttendanceRow>["side"]> | undefined) {
  const onChange = vi.fn();
  render(
    <AttendanceRow
      player={player}
      attendance={{ status: null }}
      onChange={() => {}}
      disabled
      side={side ? { current: "left", override: false, editable: true, onChange, ...side } : undefined}
    />
  );
  return onChange;
}

describe("AttendanceRow — side in this occurrence (PAD-551)", () => {
  it("has no side control without side props", () => {
    row(undefined);
    expect(screen.queryByTestId("participant-side-usual-7")).toBeNull();
  });

  it("starts on the usual side and sets the other one for this class", () => {
    const onChange = row({ current: "left", override: false });
    expect(screen.getByTestId("participant-side-usual-7")).toHaveAttribute("data-state", "on");
    expect(screen.queryByTestId("participant-side-7")).toBeNull();
    fireEvent.click(screen.getByTestId("participant-side-right-7"));
    expect(onChange).toHaveBeenCalledWith("right");
  });

  it("marks an override and clears it back to the usual side", () => {
    const onChange = row({ current: "right", override: true });
    expect(screen.getByTestId("participant-side-right-7")).toHaveAttribute("data-state", "on");
    expect(screen.getByTestId("participant-side-7").textContent).toBe("calendar.side.tag.right");
    fireEvent.click(screen.getByTestId("participant-side-usual-7"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("shows the tag but no control once the server says it is not editable", () => {
    row({ current: "right", override: true, editable: false });
    expect(screen.getByTestId("participant-side-7")).toBeInTheDocument();
    expect(screen.queryByTestId("participant-side-usual-7")).toBeNull();
  });
});
