import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/**
 * B-252: jsdom has no top layer (no `dialog.showModal()`, no popover API), so `:modal`
 * and `:popover-open` can never match here. floating-ui (behind every Radix popper:
 * dropdown menus, popovers, selects, tooltips) asks each ancestor exactly those two on
 * every position update (`isTopLayer`), and jsdom's selector engine (nwsapi 2.2.27)
 * answers `:modal` by re-entering its own `matches` — about 300 ms of CPU per call,
 * which put the PAD-462 dropdown tests at 15–45 s under machine load. Answer the two
 * directly; every other selector goes to jsdom unchanged.
 */
const TOP_LAYER_PSEUDO_CLASSES = new Set([":modal", ":popover-open"]);
const jsdomMatches = Element.prototype.matches;
Element.prototype.matches = function matches(this: Element, selector: string): boolean {
  return TOP_LAYER_PSEUDO_CLASSES.has(selector) ? false : jsdomMatches.call(this, selector);
};
