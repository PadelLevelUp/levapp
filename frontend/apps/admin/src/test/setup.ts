import "@testing-library/jest-dom";

// jsdom has no matchMedia. The stub answers "desktop" (matches: false) unless a test calls
// setPhoneViewport(true) before rendering (admin.phone-console).
declare global {
  interface Window {
    __phoneViewport?: boolean;
  }
}

if (typeof window.matchMedia !== "function") {
  window.matchMedia = (media: string) =>
    ({
      get matches() {
        return window.__phoneViewport === true;
      },
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

export function setPhoneViewport(matches: boolean) {
  window.__phoneViewport = matches;
}
