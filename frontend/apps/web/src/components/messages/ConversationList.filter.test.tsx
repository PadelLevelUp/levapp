/**
 * PAD-648 — messaging.conversations rule 17: "Todas" / "Não lidas" above the list.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Conversation } from "@/types";
import { ConversationList } from "./ConversationList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

const noop = () => {};

const renderList = (props: Partial<React.ComponentProps<typeof ConversationList>> = {}) =>
  render(
    <ConversationList
      conversations={[]}
      selectedId={null}
      onSelect={noop}
      onNewConversation={noop}
      filter="all"
      onFilterChange={noop}
      {...props}
    />
  );

describe("ConversationList — the unread filter (PAD-648)", () => {
  it("shows both choices with the current one pressed", () => {
    renderList({ filter: "unread" });
    // Radix renders a single-choice group as radios: data-state on/off, aria-checked.
    expect(screen.getByTestId("conversations-filter-all")).toHaveAttribute("data-state", "off");
    expect(screen.getByTestId("conversations-filter-unread")).toHaveAttribute("data-state", "on");
    expect(screen.getByTestId("conversations-filter-unread")).toHaveAttribute("aria-checked", "true");
  });

  it("reports a choice and ignores a click on the current one", () => {
    const onFilterChange = vi.fn();
    renderList({ filter: "all", onFilterChange });
    fireEvent.click(screen.getByTestId("conversations-filter-all"));
    expect(onFilterChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("conversations-filter-unread"));
    expect(onFilterChange).toHaveBeenCalledWith("unread");
  });

  it("says there is nothing unread when the unread list is empty", () => {
    renderList({ filter: "unread" });
    expect(screen.getByTestId("conversations-empty")).toHaveAttribute("data-filter", "unread");
    expect(screen.getByTestId("conversations-empty").textContent).toBe("messages.noUnreadConversations");
  });

  it("keeps the old empty message for the full list", () => {
    renderList({ filter: "all" });
    expect(screen.getByTestId("conversations-empty").textContent).toBe("messages.noConversationsFound");
  });
});
