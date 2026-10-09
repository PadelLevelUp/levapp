/**
 * PAD-564 (notifications.groups rule 6): the side criterion reads "Balance the class sides" — the
 * level criterion keeps "Same as vacancy" — and a help text under a side rule gives the three
 * balancing examples and the special-cases line (rule 6a). The stored rule is untouched. Asserted
 * by test id and translation key (the mock returns keys); the keys are proved to exist in both
 * locale files, so a missing translation cannot pass.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { DEFAULT_INVITATION_GROUPS, InvitationGroupsSection, SIDE_BALANCE_EXAMPLES } from "./InvitationGroupsSection";

const HELP_PARTS = ["intro", ...SIDE_BALANCE_EXAMPLES, "special"];
const sideRuleCount = DEFAULT_INVITATION_GROUPS.flatMap((g) => g.rules).filter((r) => r.attribute === "side").length;

describe("PAD-564 the side criterion says it balances the class (rule 6)", () => {
  it("labels the side rule as balancing, keeps the level label, and shows the examples under it", () => {
    expect(sideRuleCount).toBeGreaterThan(0);
    render(<InvitationGroupsSection groups={DEFAULT_INVITATION_GROUPS} onChange={() => {}} />);

    const helps = screen.getAllByTestId("invitation-group-side-help");
    expect(helps).toHaveLength(sideRuleCount);
    for (const part of HELP_PARTS) expect(helps[0]).toHaveTextContent(`settings.invitationGroups.sideBalanceHelp.${part}`);
    expect(screen.getAllByText("settings.invitationGroups.operations.balanceSides")).toHaveLength(sideRuleCount);
    expect(screen.getAllByText("settings.invitationGroups.operations.sameAsVacancy").length).toBeGreaterThan(0);
    // The stored operation is what it was: the copy changed, not the rule.
    expect(DEFAULT_INVITATION_GROUPS.flatMap((g) => g.rules).find((r) => r.attribute === "side")?.operation).toBe("same_as_vacancy");
  });

  it("has every key in both locales, and the tutorial's side rule words match the rename", () => {
    for (const lang of ["pt", "en"]) {
      const settings = JSON.parse(readFileSync(resolve(__dirname, `../../../../../src/locales/${lang}/settings.json`), "utf8"));
      const groups = settings.settings.invitationGroups;
      expect(typeof groups.operations.balanceSides, `${lang} balanceSides`).toBe("string");
      for (const part of HELP_PARTS) expect(typeof groups.sideBalanceHelp[part], `${lang} ${part}`).toBe("string");
      const tutorials = JSON.parse(readFileSync(resolve(__dirname, `../../../../../src/locales/${lang}/tutorials.json`), "utf8"));
      const words: string = tutorials.tutorials.rules.side.same_as_vacancy;
      expect(words).toBe(tutorials.tutorials.rules.side.same_side);
      expect(words.toLowerCase()).toBe(groups.operations.balanceSides.toLowerCase());
    }
  });
});
