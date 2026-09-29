/**
 * PAD-438 / B-223 (dashboard.blocks rule 3a, criterion "The student's record keeps its layout when
 * rows appear above it"). On iOS, a block above "Your record" that grew after the dashboard's first
 * layout (a class the coach added, a claim banner) collapsed the KPI tiles to empty 30 px cards,
 * reproduced 6/6 on the simulator. Each tile is a `flex-1` cell in its row; the card inside it was
 * ALSO `flex-1`, which css-interop compiles to `flexBasis: "0%"` inside a column cell whose height
 * comes only from the row. With the card on `grow` (flexGrow, basis auto) the same triggers left
 * every card at full height (5/5), as the coach's `Stat` cards, which sit in the row directly.
 * Flow 116 is the end-to-end check; this pins the structure where the unit suite can see it.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardKpiGridBlock } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
// `./blocks` pulls in `@/components/ui/toast`, which reaches `@expo/vector-icons` at import time.
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { KpiTiles } from "./blocks";

const block = {
  type: "kpi_grid",
  data: {
    items: [
      { label: "Attended", value: 21, total: 39, href: "/attendance?tab=attended" },
      { label: "Missed", value: 18, total: 39, href: "/attendance?tab=missed" },
      { label: "Upcoming lessons", value: 36 },
      { label: "Invites", value: 0 },
    ],
  },
} as unknown as DashboardKpiGridBlock;

const tokens = (node: { props: { className?: unknown } }) => String(node.props.className ?? "").split(/\s+/);
/** `flex-1`, `flex-auto`, `flex-[…]`, `basis-*`: every class that sets flex-basis on a card. */
const zeroBasisRisk = (token: string) => /^(flex-(\d|auto|initial|\[)|basis-)/.test(token);

describe("the student's KPI tiles keep their layout (PAD-438, B-223)", () => {
  it("no card inside a tile takes flex-1 (flexBasis 0%): it grows from its content instead", async () => {
    const n = await renderNative(createElement(KpiTiles, { block }));
    for (const slug of ["attended", "missed", "upcoming-lessons", "invites"]) {
      const tile = n.byTestId(`dashboard-kpi-${slug}`);
      const cards = tile.findAll((node) => tokens(node).includes("rounded-2xl"));
      expect(cards.length, `the ${slug} tile renders its card`).toBeGreaterThan(0);
      for (const card of cards) {
        expect(tokens(card), `the ${slug} card`).toContain("grow");
        // Any class that sets a basis (or the flex shorthand, which sets one) would bring the zero
        // basis back under another name — `grow basis-0` included (review note on #481).
        expect(tokens(card).filter(zeroBasisRisk), `the ${slug} card`).toEqual([]);
      }
    }
  });

  it("the tiles themselves still share their row equally", async () => {
    const n = await renderNative(createElement(KpiTiles, { block }));
    for (const slug of ["attended", "missed", "upcoming-lessons", "invites"]) {
      expect(tokens(n.byTestId(`dashboard-kpi-${slug}`))).toContain("flex-1");
    }
  });
});
