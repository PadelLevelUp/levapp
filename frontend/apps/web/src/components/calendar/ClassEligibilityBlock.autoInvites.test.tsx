/**
 * PAD-429 (`notifications.toggle-class` rules 5, 7): the automatic-invitations
 * tri-state on the class detail — inherit/on/off (`null`/`true`/`false`),
 * shown beside the open-spots control it mirrors, with its resolved source.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ClassEligibilityBlock } from "./ClassEligibilityBlock";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

function renderBlock(overrides: Partial<Parameters<typeof ClassEligibilityBlock>[0]> = {}) {
  const onAutoInvitesChange = vi.fn();
  render(
    <ClassEligibilityBlock
      current={null}
      effective={null}
      source="coach"
      editing
      onChange={() => {}}
      autoInvites={null}
      effectiveAutoInvites={false}
      autoInvitesSource="type"
      onAutoInvitesChange={onAutoInvitesChange}
      {...overrides}
    />
  );
  return { onAutoInvitesChange };
}

describe("class-auto-invites-control", () => {
  it("renders the resolved mode and source label", () => {
    renderBlock({
      autoInvites: null,
      effectiveAutoInvites: false,
      autoInvitesSource: "type",
    });
    const control = screen.getByTestId("class-auto-invites-control");
    expect(control).toBeInTheDocument();
    const source = screen.getByTestId("class-auto-invites-source");
    expect(source).toHaveAttribute("data-source", "type");
    expect(source).toHaveTextContent("calendar.autoInvites.source.type");
    expect(source).toHaveTextContent("calendar.autoInvites.mode.off");
  });

  it("sends autoInvites null when the coach picks the inherit option", () => {
    const { onAutoInvitesChange } = renderBlock({
      autoInvites: true,
      effectiveAutoInvites: true,
      autoInvitesSource: "instance",
    });
    fireEvent.click(screen.getByTestId("class-auto-invites-mode-inherit"));
    expect(onAutoInvitesChange).toHaveBeenCalledWith(null);
  });

  it("sends autoInvites true when the coach picks on", () => {
    const { onAutoInvitesChange } = renderBlock({
      autoInvites: null,
      effectiveAutoInvites: false,
      autoInvitesSource: "type",
    });
    fireEvent.click(screen.getByTestId("class-auto-invites-mode-on"));
    expect(onAutoInvitesChange).toHaveBeenCalledWith(true);
  });

  it("sends autoInvites false when the coach picks off", () => {
    const { onAutoInvitesChange } = renderBlock({
      autoInvites: null,
      effectiveAutoInvites: true,
      autoInvitesSource: "lesson",
    });
    fireEvent.click(screen.getByTestId("class-auto-invites-mode-off"));
    expect(onAutoInvitesChange).toHaveBeenCalledWith(false);
  });

  it("is absent when no onAutoInvitesChange handler is passed", () => {
    render(
      <ClassEligibilityBlock
        current={null}
        effective={null}
        source="coach"
        editing
        onChange={() => {}}
      />
    );
    expect(screen.queryByTestId("class-auto-invites-control")).toBeNull();
  });
});
