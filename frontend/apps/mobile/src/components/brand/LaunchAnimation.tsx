import * as React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, {
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

/**
 * The LevApp launch animation.
 *
 * This is a port of the motion study that ships with the design system —
 * `.claude/skills/levapp-design-system/animations/LA-launch-v2-split-then-draw.html`
 * — NOT an animation invented here. The geometry, the timing windows, the
 * easing curves and the two-scene structure are all taken from that file so
 * the app launches with the mark the brand actually designed.
 *
 * How it reads: the mark is cut into four slabs — the L's stem and foot, and
 * the A's two legs. Each is revealed by a hard-edged wipe travelling along its
 * own axis, so a stroke appears to be drawn rather than faded in. A single
 * white line strikes down first; the white and blue halves sit on ONE shared
 * line until they separate; only then do the two second strokes unfold
 * together. A glow builds behind it, and the whole mark breathes once, scales
 * up and dissolves into the app.
 *
 * It runs to completion before the app is revealed — 3.5s, unhurried, by
 * explicit request. Nothing here waits on data or fonts, so the timing is the
 * same on every launch.
 *
 * Implementation note: this is driven by a requestAnimationFrame clock and
 * plain re-renders, NOT by Reanimated. Reanimated was tried first and its
 * `useAnimatedProps` never reached react-native-svg here — measured, not
 * assumed: with only the animated props driving them, three of the four slabs
 * never rendered at all and the fourth froze at its initial geometry, while
 * `useAnimatedStyle` on the enclosing Views worked fine. A frame clock costs
 * a re-render of this subtree per frame, which measured at ~29fps against a
 * 30fps capture ceiling on the simulator, with a single 0.2s hiccup. If that
 * ever regresses on a low-end device, the fix is to move the wipe off SVG
 * (rotated clipping Views) rather than back to animated SVG props.
 */

const DRAW_MS = 2600;
const SETTLE_MS = 900;
const TOTAL_MS = DRAW_MS + SETTLE_MS;
const DRAW_FRAC = DRAW_MS / TOTAL_MS;

/** Background the mark is drawn on — the design system's `bg` tweak default. */
export const LAUNCH_BG = "#0d1b31";
const PALETTE = ["#2a70ea", "#1553d9", "#2f8aff"] as const;

// The four slabs, in the source's own coordinate space.
const PATHS = {
  STEM: "M211 153L304 153L164 495L74 495Z",
  FOOT: "M180 435L385 435L363 495L159 495Z",
  AL: "M405 153L277 415L348 415L405 305Z",
  AR: "M405 153L571 495L500 495L398 291Z",
};
const VERTS: Record<SlabKey, number[][]> = {
  STEM: [[211, 153], [304, 153], [164, 495], [74, 495]],
  FOOT: [[180, 435], [385, 435], [363, 495], [159, 495]],
  AL: [[405, 153], [277, 415], [348, 415], [405, 305]],
  AR: [[405, 153], [571, 495], [500, 495], [398, 291]],
};
type SlabKey = "STEM" | "FOOT" | "AL" | "AR";

const norm = (x: number, y: number): [number, number] => {
  const m = Math.hypot(x, y);
  return [x / m, y / m];
};
const DIRS: Record<SlabKey, [number, number]> = {
  STEM: norm(-0.4, 1),
  FOOT: norm(1, 0.12),
  AL: norm(128, -262),
  AR: norm(166, 342),
};

/** Horizontal offsets that pull both halves onto one shared line at the centre. */
const SPLIT_STEM = 86;
const SPLIT_AL = -86;
/** Whole-mark offset so the un-split line sits on the centre axis. */
const CENTER_SHIFT = 49.5;

// How far the wipe must travel to cross each slab, projected onto its axis.
const RANGE = (Object.keys(VERTS) as SlabKey[]).reduce((acc, k) => {
  const d = DIRS[k];
  const ts = VERTS[k].map((p) => p[0] * d[0] + p[1] * d[1]);
  acc[k] = [Math.min(...ts) - 4, Math.max(...ts) + 4];
  return acc;
}, {} as Record<SlabKey, [number, number]>);

const clamp01 = (v: number) => {
  return v < 0 ? 0 : v > 1 ? 1 : v;
};
const seg = (t: number, a: number, b: number) => {
  return clamp01((t - a) / (b - a));
};
const outCubic = (t: number) => {
  return 1 - Math.pow(1 - t, 3);
};
const outQuint = (t: number) => {
  return 1 - Math.pow(1 - t, 5);
};
const inOutQuint = (t: number) => {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
};
const inOutCubic = (t: number) => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const lerp = (a: number, b: number, t: number) => {
  return a + (b - a) * t;
};

/**
 * The half-plane behind the wipe line, as a polygon. Clipped to a slab, it
 * exposes exactly the part of that slab the wipe has passed.
 */
function wipePoly(dx: number, dy: number, lo: number, hi: number, p: number) {
  const T = lerp(lo, hi, p);
  const S = 2400;
  const px = -dy;
  const py = dx;
  const bx = dx * T;
  const by = dy * T;
  const pts: number[][] = [
    [bx + px * S, by + py * S],
    [bx - px * S, by - py * S],
    [bx - px * S - dx * S * 2, by - py * S - dy * S * 2],
    [bx + px * S - dx * S * 2, by + py * S - dy * S * 2],
  ];
  return pts.map((q) => q[0].toFixed(1) + "," + q[1].toFixed(1)).join(" ");
}

/** The wipe polygon for a slab at progress `p`. */
function poly(key: SlabKey, p: number) {
  const [dx, dy] = DIRS[key];
  const [lo, hi] = RANGE[key];
  return wipePoly(dx, dy, lo, hi, p);
}


interface Frame {
  dStem: number;
  dFoot: number;
  dAL: number;
  dAR: number;
  split: number;
  blueOp: number;
  scale: number;
  glow: number;
  opacity: number;
}

/**
 * Every per-frame value, derived from one clock so the scenes stay in
 * lockstep — `c` runs 0→1 across both scenes.
 */
function frameAt(c: number): Frame {
  const dp = clamp01(c / DRAW_FRAC);
  if (c < DRAW_FRAC) {
    return {
      dStem: outQuint(seg(dp, 0.02, 0.32)), // the white line strikes down
      dFoot: inOutCubic(seg(dp, 0.7, 1)), // second strokes, after the split
      dAL: 1,
      dAR: inOutCubic(seg(dp, 0.7, 1)), // same span → same unfolding speed
      split: inOutQuint(seg(dp, 0.46, 0.82)), // held, then separates in two
      blueOp: dp >= 0.34 ? 1 : 0, // blue waits hidden behind the white line
      scale: lerp(0.955, 1, outCubic(dp)),
      glow: inOutCubic(seg(dp, 0.4, 1)),
      opacity: 1,
    };
  }
  // Settle: one breath, then it scales up and dissolves into the app.
  const sp = clamp01((c - DRAW_FRAC) / (1 - DRAW_FRAC));
  const breath = Math.sin(clamp01(sp / 0.5) * Math.PI) * 0.012;
  const out = inOutQuint(seg(sp, 0.45, 1));
  return {
    dStem: 1,
    dFoot: 1,
    dAL: 1,
    dAR: 1,
    split: 1,
    blueOp: 1,
    scale: 1 + breath + out * 0.28,
    glow: 1 - out,
    opacity: 1 - inOutCubic(seg(sp, 0.5, 0.99)),
  };
}

export function LaunchAnimation({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  // 560 of the study's 1080-wide stage — kept proportional rather than fixed,
  // so the mark occupies the same share of every screen.
  const logoW = Math.min(width * 0.52, 560);
  const logoH = (logoW * 366) / 525;
  const glowSize = logoW * 2.4;

  const [c, setC] = React.useState(0);

  React.useEffect(() => {
    let raf = 0;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / TOTAL_MS);
      setC(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else onDone();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const f = frameAt(c);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.veil, { opacity: f.opacity }]}
      pointerEvents={f.opacity < 0.02 ? "none" : "auto"}
      testID="launch-animation"
    >
      <View
        style={{
          position: "absolute",
          width: glowSize,
          height: glowSize,
          opacity: f.glow * 0.55,
          transform: [{ scale: lerp(0.7, 1, f.glow) }],
        }}
        pointerEvents="none"
      >
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={PALETTE[2]} stopOpacity={0.33} />
              <Stop offset="0.38" stopColor={PALETTE[2]} stopOpacity={0.09} />
              <Stop offset="0.68" stopColor={PALETTE[2]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={glowSize} height={glowSize} fill="url(#glow)" />
        </Svg>
      </View>

      <View style={{ transform: [{ scale: f.scale }] }}>
        <Svg width={logoW} height={logoH} viewBox="60 140 525 366">
          <Defs>
            <LinearGradient
              id="la-grad"
              gradientUnits="userSpaceOnUse"
              x1="277"
              y1="153"
              x2="571"
              y2="495"
            >
              <Stop offset="0" stopColor={PALETTE[0]} />
              <Stop offset="0.45" stopColor={PALETTE[1]} />
              <Stop offset="1" stopColor={PALETTE[2]} />
            </LinearGradient>
            <ClipPath id="clip-STEM"><Path d={PATHS.STEM} /></ClipPath>
            <ClipPath id="clip-FOOT"><Path d={PATHS.FOOT} /></ClipPath>
            <ClipPath id="clip-AL"><Path d={PATHS.AL} /></ClipPath>
            <ClipPath id="clip-AR"><Path d={PATHS.AR} /></ClipPath>
          </Defs>

          <G translateX={(1 - f.split) * CENTER_SHIFT}>
            <G translateX={(1 - f.split) * SPLIT_AL} opacity={f.blueOp}>
              <G clipPath="url(#clip-AL)">
                <Polygon points={poly("AL", f.dAL)} fill="url(#la-grad)" />
              </G>
              <G clipPath="url(#clip-AR)">
                <Polygon points={poly("AR", f.dAR)} fill="url(#la-grad)" />
              </G>
            </G>
            <G translateX={(1 - f.split) * SPLIT_STEM}>
              <G clipPath="url(#clip-STEM)">
                <Polygon points={poly("STEM", f.dStem)} fill="#ffffff" />
              </G>
              <G clipPath="url(#clip-FOOT)">
                <Polygon points={poly("FOOT", f.dFoot)} fill="#ffffff" />
              </G>
            </G>
          </G>
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: {
    backgroundColor: LAUNCH_BG,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
});
