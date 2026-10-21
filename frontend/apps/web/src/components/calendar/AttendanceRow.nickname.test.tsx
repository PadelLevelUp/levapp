/** players.nickname rule 8 (PAD-660): the coach's attendance row prints their name for the student; the student's own row keeps theirs. */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Player } from "@/types";

const enabledSeen: Array<boolean | undefined> = [];
vi.mock("@levelup/hooks", async (orig) => ({
  ...(await orig<typeof import("@levelup/hooks")>()),
  useCoachDisplayName: (opts?: { enabled?: boolean }) => {
    enabledSeen.push(opts?.enabled);
    return (id: unknown, real: string | null | undefined) =>
      opts?.enabled && String(id) === "7" ? "Jorge chato" : (real ?? "");
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { AttendanceRow } from "./AttendanceRow";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const player = (id: string, name: string) => ({ id, user: { name } }) as unknown as Player;
const show = (p: Player, audience?: "coach" | "student") =>
  render(<AttendanceRow player={p} attendance={{ status: null }} onChange={() => {}} audience={audience} />);

describe("AttendanceRow name", () => {
  it("is the coach's nickname on a coach row, and the real name for another student", () => {
    const { unmount } = show(player("7", "Jorge Silva"), "coach");
    expect(screen.getByText("Jorge chato")).toBeTruthy();
    expect(screen.queryByText("Jorge Silva")).toBeNull();
    unmount();
    show(player("8", "Ana Pinto"), "coach");
    expect(screen.getByText("Ana Pinto")).toBeTruthy();
  });

  it("asks no roster and keeps the real name on the student's own row", () => {
    show(player("7", "Jorge Silva"), "student");
    expect(screen.getByText("Jorge Silva")).toBeTruthy();
    expect(enabledSeen.at(-1)).toBe(false);
  });
});
