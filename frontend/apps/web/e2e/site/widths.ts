import { expect, type Page } from "@playwright/test";

/**
 * PAD-656's width list: every site page is checked at each of these (phones, tablets and the
 * menu's transition, desktops).
 */
export const SITE_WIDTHS = [320, 360, 390, 414, 768, 992, 1024, 1100, 1280, 1440, 1920] as const;

/**
 * Nothing on the page reaches past the viewport, except inside a box that scrolls horizontally on
 * purpose (`overflow-x: auto | scroll`, e.g. the calendar mockup).
 *
 * Why geometry and not `scrollWidth`: SiteLayout's root clips horizontal overflow
 * (`overflow-x-clip`), so the document never reports a horizontal scroll however far a child
 * sticks out. That check would pass while content is cut off. Playwright's `toBeVisible()`
 * also counts a clipped element as visible. This asserts every rendered element's box instead
 * (the e2e/availability/mobile-layout.spec.ts lesson, applied to the site).
 */
export async function expectFitsViewport(page: Page, label: string) {
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scrollsX = (el: Element | null) => {
      for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
      }
      return false;
    };
    const out: string[] = [];
    const root = document.querySelector('[data-testid="site"]') ?? document.body;
    for (const el of Array.from(root.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.position === "fixed") continue;
      if (r.right <= vw + 1 && r.left >= -1) continue;
      if (scrollsX(el)) continue;
      const id = el.getAttribute("data-testid");
      out.push(`${el.tagName.toLowerCase()}${id ? `[data-testid=${id}]` : ""} ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
      if (out.length >= 5) break;
    }
    return out;
  });
  expect(offenders, `${label}: elements past the viewport`).toEqual([]);
}
