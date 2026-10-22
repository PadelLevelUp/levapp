import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { CalendarMockup } from "./CalendarMockup";

const K = "site.coaches.calendar.";

describe("CalendarMockup (PAD-656)", () => {
  it("is an image labelled by the i18n key, inside a horizontally scrolling wrapper", () => {
    render(<CalendarMockup />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", `${K}label`);
    const wrapper = screen.getByTestId("site-calendar");
    expect(wrapper.className).toContain("overflow-x-auto");
    expect(wrapper.className).toContain("max-w-full");
    expect(wrapper).toContainElement(screen.getByRole("img"));
  });

  it("lists the states, bar, Pack and levels in a real list outside the image", () => {
    render(<CalendarMockup />);
    const legend = screen.getByTestId("site-calendar-legend");
    expect(screen.getByRole("img")).not.toContainElement(legend);
    const items = within(legend).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(
      ["next", "upcoming", "fullRunning", "done", "event", "bar", "pack", "levels"].map((k) => `${K}legend.${k}`),
    );
  });

  it("shows exactly one running and one next class", () => {
    render(<CalendarMockup />);
    expect(screen.getAllByText(`${K}running`)).toHaveLength(1);
    expect(screen.getAllByText(`${K}next`)).toHaveLength(1);
  });

  it("shows a full class as just 16/16 and pins the now line to Wednesday", () => {
    render(<CalendarMockup />);
    const full = document.querySelector('[data-state="full"]') as HTMLElement;
    expect(within(full).getByText("16/16")).toBeInTheDocument();
    expect(full.textContent).not.toMatch(/cheia/i);
    expect(screen.getByTestId("site-calendar-now").style.gridColumn).toBe("4");
    expect(screen.getAllByTestId("site-calendar-event")).toHaveLength(5);
  });
});
