import { describe, expect, it } from "vitest";

import {
  axisMax,
  axisTicks,
  barRects,
  labelIndices,
  linePoints,
  polylinePoints,
  yFor,
} from "./chart-geometry";

describe("axisMax", () => {
  it("clears the tallest value with a step of headroom", () => {
    expect(axisMax([0, 3, 7, 2])).toBe(8);
  });

  it("never drops below the floor, so a quiet period is not all-peaks", () => {
    expect(axisMax([0, 0, 1])).toBe(4);
    expect(axisMax([])).toBe(4);
  });

  it("honours a caller-supplied floor", () => {
    expect(axisMax([1], 2)).toBe(2);
  });
});

describe("axisTicks", () => {
  it("returns whole numbers only", () => {
    for (const tick of axisTicks(8)) expect(Number.isInteger(tick)).toBe(true);
  });

  it("starts at zero and ends exactly at the axis top", () => {
    const ticks = axisTicks(8);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBe(8);
  });

  it("thins rather than emitting fractions when yMax does not divide", () => {
    // 7 / 4 -> step 2 -> 0, 2, 4, 6, 7. Fewer ticks, none fractional.
    expect(axisTicks(7, 5)).toEqual([0, 2, 4, 6, 7]);
  });

  it("degenerates safely at zero", () => {
    expect(axisTicks(0)).toEqual([0]);
  });
});

describe("yFor", () => {
  it("puts zero on the baseline and the axis top at the frame", () => {
    expect(yFor(0, 8, 200)).toBe(200);
    expect(yFor(8, 8, 200)).toBe(0);
  });

  it("is linear in between", () => {
    expect(yFor(4, 8, 200)).toBe(100);
  });

  it("clamps a value above the axis top instead of escaping the plot", () => {
    expect(yFor(99, 8, 200)).toBe(0);
  });
});

describe("barRects", () => {
  const values = [0, 2, 4];

  it("keeps every bar inside the plot", () => {
    for (const r of barRects(values, 4, 300, 200)) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(300);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height).toBeCloseTo(200);
    }
  });

  it("grows a bar from the baseline in proportion to its value", () => {
    const [zero, half, full] = barRects(values, 4, 300, 200);
    expect(zero.height).toBe(0);
    expect(half.height).toBe(100);
    expect(full.height).toBe(200);
  });

  it("centres each bar in its own equal-width slot", () => {
    const rects = barRects(values, 4, 300, 200);
    rects.forEach((r, i) => {
      expect(r.x + r.width / 2).toBeCloseTo(i * 100 + 50);
    });
  });

  it("caps the bar width so a 7-bucket week is not seven slabs", () => {
    const rects = barRects([1, 1, 1, 1, 1, 1, 1], 4, 700, 200, 40);
    for (const r of rects) expect(r.width).toBeLessThanOrEqual(40);
  });

  it("returns nothing for an unmeasured plot", () => {
    expect(barRects(values, 4, 0, 200)).toEqual([]);
    expect(barRects([], 4, 300, 200)).toEqual([]);
  });
});

describe("linePoints", () => {
  it("shares the bar slot centres, so line and bars align", () => {
    const rects = barRects([1, 2, 3], 4, 300, 200);
    const points = linePoints([1, 2, 3], 4, 300, 200);
    points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(rects[i].x + rects[i].width / 2);
    });
  });

  it("centres a lone point instead of pinning it to the axis", () => {
    expect(linePoints([3], 4, 300, 200)[0].x).toBe(150);
  });
});

describe("polylinePoints", () => {
  it("formats an SVG points attribute", () => {
    expect(
      polylinePoints([
        { x: 0, y: 10 },
        { x: 5, y: 0 },
      ])
    ).toBe("0,10 5,0");
  });
});

describe("labelIndices", () => {
  it("keeps every label when they all fit", () => {
    expect(labelIndices(5, 7)).toEqual([0, 1, 2, 3, 4]);
  });

  it("always keeps the first and the last", () => {
    const kept = labelIndices(31, 7);
    expect(kept[0]).toBe(0);
    expect(kept[kept.length - 1]).toBe(30);
  });

  it("thins a month of daily ticks to a readable row", () => {
    expect(labelIndices(31, 7).length).toBeLessThanOrEqual(7);
  });

  it("never emits a duplicate or an out-of-range index", () => {
    for (const count of [1, 2, 7, 12, 31, 366]) {
      const kept = labelIndices(count, 7);
      expect(new Set(kept).size).toBe(kept.length);
      for (const i of kept) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(count);
      }
    }
  });

  it("does not leave the last two labels adjacent after thinning", () => {
    // The failure this guards: a stride that lands on count-2 puts two labels
    // one slot apart at the right edge while the rest are evenly spread.
    for (const count of [9, 13, 15, 20, 26, 31]) {
      const kept = labelIndices(count, 7);
      const last = kept[kept.length - 1];
      const prev = kept[kept.length - 2];
      if (prev !== undefined) expect(last - prev).toBeGreaterThan(1);
    }
  });

  it("degenerates safely", () => {
    expect(labelIndices(0)).toEqual([]);
    expect(labelIndices(1)).toEqual([0]);
  });
});
