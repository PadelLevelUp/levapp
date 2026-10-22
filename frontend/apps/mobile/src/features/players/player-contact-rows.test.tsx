/**
 * PAD-731: the player screen's contact rows are translated, as on the web card. The screen
 * itself (app/, react-query) is outside the unit harness; its use of the component is pinned by
 * reading the source.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { renderNative } from "@/test/render-native";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { PlayerContactRows } from "./player-contact-rows";

const text = (n: ReactTestInstance): string =>
  n.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

describe("PlayerContactRows (PAD-731)", () => {
  it("shows the email and phone as they are", async () => {
    const n = await renderNative(createElement(PlayerContactRows, { email: "ana@example.pt", phone: "+351 912 345 678" }));
    expect(text(n.byTestId("player-info-email"))).toBe("ana@example.pt");
    expect(text(n.byTestId("player-info-phone"))).toBe("+351 912 345 678");
  });

  it("falls back to the translated empty labels, not a dash", async () => {
    const n = await renderNative(createElement(PlayerContactRows, { email: "", phone: null }));
    expect(text(n.byTestId("player-info-email"))).toBe("players.noEmail");
    expect(text(n.byTestId("player-info-phone"))).toBe("players.noPhone");
  });

  it("is what the player screen renders, with no hard-coded English labels left", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const screen = fs.readFileSync(path.resolve(here, "../../../app/player/[playerId].tsx"), "utf8");
    expect(screen).toContain("<PlayerContactRows");
    expect(screen).not.toMatch(/>\s*(Email|Phone):/);
  });
});
