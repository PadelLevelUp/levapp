/**
 * LevApp web loader — the mark forms, holds while the session resolves, then
 * reveals the app underneath.
 *
 * This is the web half of the launch animation that already ships on iOS
 * (`apps/mobile/src/components/launch-animation.tsx`). Both descend from the
 * same design export, `LA-slash-split-icon.html` (scenes `Form` + `Land`), so
 * the geometry, colours and easing below are copied across verbatim rather
 * than re-derived — a second tracing of the mark would drift from the icon.
 *
 * The design canvas for this surface is `reference/design/LA Website Loader.dc.html`
 * (and its `… Mobile.dc.html` twin, identical but for `markSize`: 300 vs 240).
 * Those two files name three scenes — `Form` 2.4s, `Loading` 1.6s, `Reveal`
 * 1.4s — but their component source (`la-loader.jsx`) was not exported with
 * them, and the animation bundle in the design system only carries `Form` and
 * `Land`. So `Form` and `Reveal` are the ported scenes (`Reveal` is `Land`);
 * the `Loading` hold in between is authored here, deliberately as the calmest
 * thing that reads as waiting — a slow breath on the glow, no bounce.
 *
 * Two deviations from the canvas, both because a login is not a design loop:
 *
 *  1. Durations. The canvas plays 2.4 + 1.6 + 1.4 = 5.4s on `loop`; those are
 *     preview numbers. `Form` runs at the 1600ms the iOS port already tuned
 *     (so the two platforms feel like one product), and `Loading` is elastic —
 *     it lasts as long as `/auth/login` plus `/auth/me` actually take, with a
 *     floor so a warm login doesn't flash.
 *  2. `prefers-reduced-motion` cuts straight to the settled mark; only the
 *     reveal fade plays. Playwright runs with `reducedMotion: "reduce"`, so
 *     the suite doesn't pay the animation on every login either.
 *
 * The clock is a single rAF loop writing `d`/`opacity`/`transform` through refs.
 * Re-rendering React 60 times a second to move six polygons would be the one
 * way to make this stutter on the frame where the dashboard mounts behind it.
 */
import { useCallback, useEffect, useRef } from "react";

/* ── Timing ─────────────────────────────────────────────────────────────── */

/** Slash drops in and resolves into the mark. Matches the iOS port. */
export const FORM_MS = 1600;
/** The mark holds while auth resolves — at least this long, so it never blinks. */
export const MIN_HOLD_MS = 420;
/** Mark zooms out, overlay fades off to the app. The canvas's `Reveal`. */
export const REVEAL_MS = 560;
/** The same scene when the mark instead flies to the app's own logo. Longer
 *  than REVEAL_MS because it travels the screen rather than fading in place. */
export const FLY_MS = 760;

/** Re-bases wobble() onto real time — the source's springs are keyed to 2.4s/0.9s. */
const WOB = 6 * (FORM_MS / 2400);
const WOB_REVEAL = 6 * (REVEAL_MS / 900);

/** How long the reveal will wait for the app's logo to become measurable. */
const GRACE_MS = 90;

/** One breath every 2.6s during the hold. */
const BREATH_MS = 2600;

/* ── Brand ──────────────────────────────────────────────────────────────── */
const BLUE_1 = "#1d4ed8";
const BLUE_2 = "#3b82f6";
const BG_TOP = "#16294a";
const BG_BOTTOM = "#0d1a30";
/** Flat stand-in for the background gradient. */
export const LAUNCH_BG = "#11213d";

/* ── Geometry ───────────────────────────────────────────────────────────────
 * Traced from the icon, in a 400x400 viewBox, with the source's runtime
 * `[+17.5, +24]` offset baked in. */
type Pt = readonly [number, number];

/** The finished mark. */
const STEM: Pt[] = [
  [145.5, 114],
  [190.5, 114],
  [116.5, 286],
  [77.5, 286],
];
const FOOT: Pt[] = [
  [123.5, 252],
  [231.5, 252],
  [218.5, 286],
  [108.5, 286],
];
const ARM1: Pt[] = [
  [239.5, 114],
  [162.5, 274],
  [198.5, 274],
  [248.5, 170],
];
const ARM2: Pt[] = [
  [239.5, 114],
  [322.5, 286],
  [287.5, 286],
  [239.5, 189],
];

/** The thick slash it grows out of, centred on the mark. */
const HALF_L: Pt[] = [
  [172.5, 114],
  [217.5, 114],
  [143.5, 286],
  [98.5, 286],
];
const HALF_A: Pt[] = [
  [217.5, 114],
  [143.5, 286],
  [188.5, 286],
  [262.5, 114],
];

/**
 * Where the mark sits inside each brand asset, as fractions of the asset's
 * rendered box. The reveal flies the animated mark onto the app's own logo, so
 * it has to land on the *mark* — not on the element's box, which is padded (the
 * bare mark) or mostly wordmark (the lockup).
 *
 * Both are derived from the assets in public/brand, which draw the mark from
 * the same path data this file animates:
 *   - lockup (viewBox 546x140): `translate(0,20) scale(0.2212) translate(-189,-286)`
 *     over the raw mark box x 288..952, y 248..700 -> x [0, 146.88], y [20, 119.98].
 *   - bare mark (viewBox "162 259 718 506"): `translate(-99,38)` over the same
 *     box -> x 189..853, y 286..738, i.e. a uniform 27-unit keyline all round.
 * If either asset is redrawn, these have to be recomputed.
 */
const LOGO_INSETS = {
  lockup: { left: 0, top: 20 / 140, width: 146.88 / 546, height: 99.98 / 140 },
  mark: { left: 27 / 718, top: 27 / 506, width: 664 / 718, height: 452 / 506 },
} as const;

/** Transform origins. */
const BASE_X = 200;
const BASE_Y = 286;
const APEX_X = 239.5;
const APEX_Y = 114;
const FOOT_X = 123.5;
const FOOT_Y = 274;

const VB = 400;

/** The canvas's `markSize` tweak: 300 on desktop, 240 on the mobile artboard. */
const MARK_PX = 300;
const MARK_PX_MOBILE = 240;
const MOBILE_MAX_W = 640;

/* ── Maths ──────────────────────────────────────────────────────────────── */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inCubic = (t: number) => t * t * t;
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const inOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const backOut = (t: number, s: number) =>
  t >= 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const wobble = (t: number, f: number, d: number) =>
  t <= 0 ? 0 : Math.sin(t * f) * Math.exp(-t * d);

/** Vertex-wise interpolation between two polygons with matching point counts. */
function mixPts(a: Pt[], b: Pt[], t: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < a.length; i++) {
    out.push([lerp(a[i][0], b[i][0], t), lerp(a[i][1], b[i][1], t)]);
  }
  return out;
}

/**
 * The source's `xf()` helper, applied to points rather than emitted as a
 * transform string: translate(tx ty) translate(px py) rotate(r) scale(sx sy)
 * translate(-px -py).
 */
function xfPts(
  pts: readonly (readonly number[])[],
  px: number,
  py: number,
  tx: number,
  ty: number,
  sx: number,
  sy: number,
  rot: number,
): number[][] {
  const r = (rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const out: number[][] = [];
  for (let i = 0; i < pts.length; i++) {
    const x = (pts[i][0] - px) * sx;
    const y = (pts[i][1] - py) * sy;
    out.push([x * cos - y * sin + px + tx, x * sin + y * cos + py + ty]);
  }
  return out;
}

/**
 * Sutherland–Hodgman clip of a convex polygon against the half-plane
 * `y <= limit`. Stands in for the source's animated wash `<clipPath>`.
 */
function clipBelow(pts: number[][], limit: number): number[][] {
  const out: number[][] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const curIn = cur[1] <= limit;
    const nextIn = next[1] <= limit;
    if (curIn) out.push(cur);
    if (curIn !== nextIn) {
      const t = (limit - cur[1]) / (next[1] - cur[1]);
      out.push([cur[0] + (next[0] - cur[0]) * t, limit]);
    }
  }
  return out;
}

function toPath(pts: number[][]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += `L${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  }
  return `${d}Z`;
}

type Frame = {
  drop: number;
  squash: number;
  tilt: number;
  split: number;
  kick: number;
  spring: number;
  washY: number;
  ring: number;
  scale: number;
  opacity: number;
  glow: number;
};

/**
 * The whole animation as a pure function of the two clocks. `p` drives `Form`;
 * once `e` leaves 0 `Reveal` takes over from the settled pose, so the held
 * `Loading` frame and the exit share one code path.
 */
function frameAt(p: number, e: number): Frame {
  if (e > 0) {
    const out = inCubic(seg(e, 0.4, 1));
    return {
      drop: 0,
      squash: 1 - 0.03 * wobble(seg(e, 0, 0.5) * WOB_REVEAL, 5.5, 3),
      tilt: 0,
      split: 1,
      kick: 1,
      spring: 1,
      washY: 100 + 200,
      ring: 1,
      scale: 1 + out * 0.24,
      opacity: 1 - inOutCubic(seg(e, 0.45, 0.99)),
      glow: 1 - out,
    };
  }
  const enter = seg(p, 0, 0.26);
  return {
    drop: lerp(-820, 0, backOut(enter, 1.5)),
    squash:
      1 -
      0.26 * wobble(seg(p, 0.2, 0.62) * WOB, 5.4, 2.4) +
      0.3 * (1 - enter) * (1 - enter),
    tilt: -3.5 * wobble(seg(p, 0.24, 0.8) * WOB, 4.4, 2.8),
    split: backOut(seg(p, 0.3, 0.6), 2.0),
    kick: backOut(seg(p, 0.56, 0.8), 2.8),
    spring: backOut(seg(p, 0.64, 0.9), 3.0),
    washY: 100 + 200 * backOut(seg(p, 0.82, 1), 1.6),
    ring: seg(p, 0.82, 1),
    scale: 1 + 0.05 * wobble(seg(p, 0.84, 1) * WOB, 6, 3),
    opacity: 1,
    glow: seg(p, 0.6, 1),
  };
}

type Flight = {
  /** Transform origin, in viewport px — the animated mark's own centre. */
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  scale: number;
};

/**
 * The on-screen box of the app's logo mark, or null if no logo is visible.
 *
 * Four elements in AppLayout carry the mark and several are in the DOM at once
 * — the mobile header ships both a light and a dark variant and lets CSS pick,
 * and the desktop sidebar is `hidden md:flex`. So this filters on a non-zero
 * rect rather than trusting the first match. Between `sm` and `md` nothing is
 * visible at all, which is a real breakpoint and not an error: the caller falls
 * back to the plain fade.
 */
function resolveLogoTarget(): { cx: number; cy: number; h: number } | null {
  const els = document.querySelectorAll<HTMLElement>("[data-launch-logo]");
  for (const el of Array.from(els)) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const inset =
      el.dataset.launchLogo === "lockup" ? LOGO_INSETS.lockup : LOGO_INSETS.mark;
    return {
      cx: r.left + (inset.left + inset.width / 2) * r.width,
      cy: r.top + (inset.top + inset.height / 2) * r.height,
      h: inset.height * r.height,
    };
  }
  return null;
}

/** The outer group transform, shared by every element of the mark. */
const base = (pts: readonly (readonly number[])[], f: Frame) =>
  xfPts(pts, BASE_X, BASE_Y, 0, f.drop, 2 - f.squash, f.squash, f.tilt);

/* ── Component ──────────────────────────────────────────────────────────── */

type Props = {
  /**
   * Whether the app behind the overlay is ready to be shown. `Reveal` only
   * starts once this is true AND `Form` has played out, so a slow /auth/me
   * can't stall the animation and a fast one can't cut it off mid-draw.
   */
  ready: boolean;
  /** Called once the overlay has finished fading and can be unmounted. */
  onFinish: () => void;
  /** Announced to screen readers while the overlay is up. */
  label: string;
};

export function LaunchLoader({ ready, onFinish, label }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const glyphRef = useRef<SVGGElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const stemRef = useRef<SVGPathElement>(null);
  const arm1Ref = useRef<SVGPathElement>(null);
  const arm2Ref = useRef<SVGPathElement>(null);
  const footRef = useRef<SVGPathElement>(null);
  const blue1Ref = useRef<SVGPathElement>(null);
  const blue2Ref = useRef<SVGPathElement>(null);

  // `ready` is read from inside the rAF loop, which must not restart when it
  // flips — restarting would rewind the clock and replay the mark.
  const readyRef = useRef(ready);
  readyRef.current = ready;

  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  /**
   * Maps the 400-unit mark box onto `markSize` px at the centre of the
   * viewport while letting the SVG span the whole screen, so the drop-in is
   * visible travelling down from off-screen rather than popping in at the edge
   * of a small box.
   */
  const fitViewBox = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Never let the mark crowd a short viewport — the canvas sizes assume room.
    // The factor has to clear the canvas sizes at the viewports they were drawn
    // for, or the guard quietly overrides them: at 390x844 the mobile artboard's
    // 240 needs 240/390 = 0.615, so 0.58 would have capped it at 226 and no
    // phone would ever have rendered the size the design asks for.
    const markPx = Math.min(
      w < MOBILE_MAX_W ? MARK_PX_MOBILE : MARK_PX,
      Math.min(w, h) * 0.62,
    );
    const unit = markPx / VB;
    const vbW = w / unit;
    const vbH = h / unit;
    svg.setAttribute(
      "viewBox",
      `${VB / 2 - vbW / 2} ${VB / 2 - vbH / 2} ${vbW} ${vbH}`,
    );
    if (glowRef.current) {
      const glowPx = markPx * 1.5;
      glowRef.current.style.width = `${glowPx}px`;
      glowRef.current.style.height = `${glowPx}px`;
    }
  }, []);

  useEffect(() => {
    fitViewBox();
    window.addEventListener("resize", fitViewBox);
    return () => window.removeEventListener("resize", fitViewBox);
  }, [fitViewBox]);

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let start = 0;
    /** When `Reveal` began, or 0 while `Form`/`Loading` are still running. */
    let revealAt = 0;
    /** Set once the target is measured; null means fade in place instead. */
    let flight: Flight | null = null;
    let flightDecided = false;

    const draw = (p: number, e: number, breath: number) => {
      const f = frameAt(p, e);
      const arm1 = mixPts(HALF_A, ARM1, f.split);
      const sprung = xfPts(ARM2, APEX_X, APEX_Y, 0, 0, f.spring, f.spring, 0);

      stemRef.current?.setAttribute(
        "d",
        toPath(base(mixPts(HALF_L, STEM, f.split), f)),
      );
      arm1Ref.current?.setAttribute("d", toPath(base(arm1, f)));
      arm2Ref.current?.setAttribute("d", toPath(base(sprung, f)));
      footRef.current?.setAttribute(
        "d",
        toPath(base(xfPts(FOOT, FOOT_X, FOOT_Y, 0, 0, f.kick, 1, 0), f)),
      );
      // The blue layer is the same two arm shapes, clipped to the wash line.
      blue1Ref.current?.setAttribute(
        "d",
        toPath(base(clipBelow(arm1, f.washY), f)),
      );
      blue2Ref.current?.setAttribute(
        "d",
        toPath(base(clipBelow(sprung, f.washY), f)),
      );

      const ring = ringRef.current;
      if (ring) {
        // The source mounts the ring conditionally; under a rAF clock there is
        // no re-render to mount on, so it is always present and driven to zero.
        const visible = f.ring > 0 && f.ring < 1;
        ring.setAttribute("r", String(20 + 190 * outCubic(f.ring)));
        ring.setAttribute("stroke-width", String(7 * (1 - f.ring)));
        ring.setAttribute("opacity", visible ? String(0.4 * (1 - f.ring)) : "0");
      }

      if (markRef.current) {
        if (flight) {
          // The mark flies to where the app's own logo already is, arriving
          // before the scene ends so it can sit exactly on top of it while the
          // navy finishes clearing. `frameAt`'s zoom-out is deliberately not
          // applied here — it pulls the opposite way to the shrink.
          const t = inOutCubic(seg(e, 0, 0.82));
          markRef.current.style.transformOrigin = `${flight.ox}px ${flight.oy}px`;
          markRef.current.style.transform =
            `translate(${flight.dx * t}px, ${flight.dy * t}px) ` +
            `scale(${lerp(1, flight.scale, t)})`;
          // Cross-fade the last stretch: the real logo is underneath by now, so
          // a pixel or two of mismatch dissolves instead of showing as a jump.
          markRef.current.style.opacity = String(1 - inOutCubic(seg(e, 0.86, 1)));
        } else {
          markRef.current.style.opacity = String(f.opacity);
          markRef.current.style.transform = `scale(${f.scale})`;
        }
      }
      if (glowRef.current) {
        // The glow does not travel with the mark — it would read as a comet.
        const fade = flight ? 1 - clamp01(seg(e, 0, 0.35)) : 1;
        glowRef.current.style.opacity = String(f.glow * 0.4 * breath * fade);
        glowRef.current.style.transform = `scale(${lerp(0.8, 1, f.glow)})`;
      }
      if (bgRef.current) {
        // The navy fades, NOT the root: the mark is a child of the root, so
        // fading the root would dissolve the mark halfway to the corner.
        bgRef.current.style.opacity = String(1 - inOutCubic(seg(e, 0.45, 1)));
      }
    };

    const tick = (now: number) => {
      if (!start) start = now;
      const elapsed = now - start;

      const p = reduce ? 1 : clamp01(elapsed / FORM_MS);
      const formMs = reduce ? 0 : FORM_MS;

      if (!revealAt && p >= 1 && readyRef.current && elapsed >= formMs + MIN_HOLD_MS) {
        revealAt = now;
      }

      // Decide the reveal once, on the first frames after it starts. `succeed()`
      // fires straight after `navigate()`, so the app underneath may not have
      // committed yet and the logo may not be measurable on frame one — hence a
      // short grace period rather than a single attempt. Reduced motion never
      // flies: a full-screen translate is the opposite of what it asks for.
      if (revealAt && !flightDecided) {
        const target = reduce ? null : resolveLogoTarget();
        const from = glyphRef.current?.getBoundingClientRect();
        if (target && from && from.width > 1 && from.height > 1) {
          const ox = from.left + from.width / 2;
          const oy = from.top + from.height / 2;
          flight = {
            ox,
            oy,
            dx: target.cx - ox,
            dy: target.cy - oy,
            // Fit by height: the animated glyph is 245x172 and the canonical
            // mark 664x452, so width cannot also match. At a ~23px target the
            // difference is sub-pixel and the cross-fade covers it.
            scale: target.h / from.height,
          };
          flightDecided = true;
        } else if (reduce || now - revealAt > GRACE_MS) {
          flightDecided = true;
        }
        if (flightDecided) {
          // Which path ran is otherwise invisible — a silent fallback looks
          // exactly like the flight code never having been reached.
          rootRef.current?.setAttribute("data-reveal", flight ? "fly" : "fade");
        }
      }

      const dur = flight ? FLY_MS : REVEAL_MS;
      // Hold the settled frame while the target is still being resolved, so the
      // reveal starts from a still mark rather than part-way through.
      const e = revealAt && flightDecided ? clamp01((now - revealAt) / dur) : 0;

      // `Loading`: the mark is formed and waiting. The only motion is a slow
      // breath on the glow — enough to read as alive, not as a spinner.
      const holding = p >= 1 && !revealAt;
      const breath = holding
        ? 0.72 + 0.28 * (0.5 + 0.5 * Math.sin((elapsed / BREATH_MS) * 2 * Math.PI))
        : 1;

      draw(p, e, breath);

      if (e >= 1) {
        onFinishRef.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={rootRef}
      // `fixed` and not `absolute`: this mounts next to the router, and the
      // page underneath scrolls.
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      data-testid="launch-loader"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>

      {/* The navy is its own layer so it can clear while the mark stays opaque
          and keeps travelling. LAUNCH_BG is the flat colour behind the
          gradient, and fades with it. */}
      <div
        ref={bgRef}
        className="absolute inset-0"
        style={{ background: LAUNCH_BG }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id="lu-bg" x1="0" y1="0" x2="0.5" y2="1">
              <stop offset="0" stopColor={BG_TOP} />
              <stop offset="1" stopColor={BG_BOTTOM} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#lu-bg)" />
        </svg>
      </div>

      <div ref={glowRef} className="absolute" style={{ opacity: 0 }}>
        <svg
          className="h-full w-full"
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <radialGradient id="lu-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor={BLUE_2} stopOpacity="0.24" />
              <stop offset="0.42" stopColor={BLUE_2} stopOpacity="0.07" />
              <stop offset="0.7" stopColor={BLUE_2} stopOpacity="0" />
              <stop offset="1" stopColor={BLUE_2} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="50" fill="url(#lu-glow)" />
        </svg>
      </div>

      <div ref={markRef} className="absolute inset-0">
        <svg
          ref={svgRef}
          className="h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient
              id="lu-white"
              x1="90"
              y1="100"
              x2="240"
              y2="290"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#e2e9f4" />
            </linearGradient>
            <linearGradient
              id="lu-blue"
              x1="160"
              y1="140"
              x2="325"
              y2="286"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={BLUE_1} />
              <stop offset="1" stopColor={BLUE_2} />
            </linearGradient>
          </defs>

          <circle
            ref={ringRef}
            cx={APEX_X}
            cy={190}
            fill="none"
            stroke={BLUE_2}
            opacity="0"
          />

          {/* Grouped so the reveal can measure the mark's real on-screen box
              and fly it onto the app's logo. */}
          <g ref={glyphRef}>
            <path ref={stemRef} fill="url(#lu-white)" />
            <path ref={arm1Ref} fill="url(#lu-white)" />
            <path ref={arm2Ref} fill="url(#lu-white)" />
            <path ref={blue1Ref} fill="url(#lu-blue)" />
            <path ref={blue2Ref} fill="url(#lu-blue)" />
            <path ref={footRef} fill="url(#lu-white)" />
          </g>
        </svg>
      </div>
    </div>
  );
}
