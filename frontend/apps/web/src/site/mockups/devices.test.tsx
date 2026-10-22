/** PAD-656: the site's images are WebP with a srcset and a PNG fallback; the hero loads first. */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteImage } from "./devices";

describe("SiteImage", () => {
  it("offers the 640 px and full WebP by width, with the PNG as the fallback img", () => {
    const { container } = render(<SiteImage src="/landing/screen-calendario.png" nativeWidth={1280} sizes="720px" alt="" />);
    const source = container.querySelector("source");
    expect(source?.getAttribute("type")).toBe("image/webp");
    expect(source?.getAttribute("srcset")).toBe("/landing/screen-calendario-640.webp 640w, /landing/screen-calendario.webp 1280w");
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/landing/screen-calendario.png");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.hasAttribute("fetchpriority")).toBe(false);
  });

  it("an image narrower than 640 px has only its full WebP; the hero is eager and high priority", () => {
    const { container } = render(<SiteImage src="/landing/watch-frame.png" nativeWidth={316} sizes="160px" alt="" eager priority />);
    expect(container.querySelector("source")?.getAttribute("srcset")).toBe("/landing/watch-frame.webp 316w");
    const img = container.querySelector("img");
    expect(img?.getAttribute("loading")).toBe("eager");
    expect(img?.getAttribute("fetchpriority")).toBe("high");
  });
});
