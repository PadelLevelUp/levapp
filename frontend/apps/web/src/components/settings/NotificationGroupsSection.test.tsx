/**
 * notifications.groups rule 5 (PAD-448): "Grupos a notificar" is not legacy — it picks the
 * quick-pick groups of the MANUAL invite dialog and never affects the automatic engine. The
 * settings page names it apart from the invitation groups and says so in one line.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { NotificationGroupsSection } from "./NotificationGroupsSection";

const LOCALES = join(__dirname, "..", "..", "..", "..", "..", "src", "locales");
const engine = (lang: "en" | "pt") =>
  JSON.parse(readFileSync(join(LOCALES, lang, "settings.json"), "utf8")).settings.engine;

describe("Manual invite groups say what they are (PAD-448)", () => {
  it("the section opens with the manual-invite hint", () => {
    render(<NotificationGroupsSection groups={[]} onChange={() => undefined} />);
    expect(screen.getByTestId("notify-groups-hint").textContent).toBe("settings.engine.notifyGroupsHint");
  });

  it("the copy names the two settings apart, in both languages", () => {
    expect(engine("en").notifyGroups).toBe("Manual invite groups");
    expect(engine("pt").notifyGroups).toBe("Grupos do convite manual");
    expect(engine("en").notifyGroupsHint).toBe(
      "The groups offered when you invite students by hand from a class. They don't affect automatic invitations, which follow Invitation groups.",
    );
    expect(engine("pt").notifyGroupsHint).toBe(
      "Os grupos que aparecem quando convida alunos à mão numa aula. Não afetam os convites automáticos — esses seguem os Grupos de convite.",
    );
    expect(engine("en").invitationGroupsHint).toMatch(/ Used by the automatic invitation engine\.$/);
    expect(engine("pt").invitationGroupsHint).toMatch(/ Usados pelos convites automáticos\.$/);
  });
});
