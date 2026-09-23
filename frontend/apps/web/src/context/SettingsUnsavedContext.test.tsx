/**
 * settings.unsaved-edits (PAD-394, B-157) rule 2 + "each section unmounts and
 * clears its entry" (spec Notes): the page-level registry itself, exercised
 * without a real section.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useReportUnsaved } from "./SettingsUnsavedContext";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

function Section({ id, unsaved }: { id: string; unsaved: boolean }) {
  useReportUnsaved(id, unsaved);
  return <div data-testid={`section-${id}`} />;
}

const ids = () => screen.getByTestId("unsaved-ids").textContent;

describe("SettingsUnsavedContext", () => {
  it("registers a section's unsaved flag and updates it on change", () => {
    const view = render(
      <SettingsUnsavedTestHarness>
        <Section id="a" unsaved={false} />
      </SettingsUnsavedTestHarness>
    );
    expect(ids()).toBe("");

    view.rerender(
      <SettingsUnsavedTestHarness>
        <Section id="a" unsaved={true} />
      </SettingsUnsavedTestHarness>
    );
    expect(ids()).toBe("a");
  });

  it("tracks more than one section independently", () => {
    render(
      <SettingsUnsavedTestHarness>
        <Section id="a" unsaved={true} />
        <Section id="b" unsaved={true} />
      </SettingsUnsavedTestHarness>
    );
    expect(ids()).toBe("a,b");
  });

  it("clears a section's entry when that section unmounts, even while still unsaved", () => {
    const view = render(
      <SettingsUnsavedTestHarness>
        <Section id="a" unsaved={true} />
      </SettingsUnsavedTestHarness>
    );
    expect(ids()).toBe("a");

    view.rerender(<SettingsUnsavedTestHarness>{null}</SettingsUnsavedTestHarness>);
    expect(ids()).toBe("");
  });

  it("is a no-op outside a provider (a section's own unit tests need no wrapper)", () => {
    expect(() => render(<Section id="a" unsaved={true} />)).not.toThrow();
  });
});
