import * as React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

/**
 * The LevApp launch animation.
 *
 * A port of the motion study that ships with the design system —
 * `.claude/skills/levapp-design-system/animations/LA-slash-split-icon.html`.
 * Geometry, timing windows and easing curves all come from that file; nothing
 * here is invented. Its final frame is the app icon artwork, so the animation
 * resolves into exactly the mark sitting on the home screen.
 *
 * How it reads: a single thick slash drops in from above and lands with a
 * squash and a slight tilt that wobble out; the slash then SPLITS into the L
 * and the A; the L's foot kicks out; the A's second arm springs up; a blue
 * wash sweeps down the arms; a ring pulses out from the apex. Then it settles,
 * scales up and dissolves into the app.
 *
 * It plays to completion before the app is revealed — 3.3s, unhurried, by
 * explicit request. Nothing here waits on data or fonts, so it is the same on
 * every launch.
 *
 * Implementation note: driven by a requestAnimationFrame clock and plain
 * re-renders, NOT Reanimated. Reanimated was tried first and its
 * `useAnimatedProps` never reached react-native-svg here — measured, not
 * assumed: shapes driven only by animated props never rendered at all, while
 * `useAnimatedStyle` on the enclosing Views worked fine. The frame clock
 * measured ~29fps against a 30fps capture ceiling on the simulator.
 */

const SCENE_FORM_MS = 2400;
const SCENE_LAND_MS = 900;
const TOTAL_MS = SCENE_FORM_MS + SCENE_LAND_MS;
const FORM_FRAC = SCENE_FORM_MS / TOTAL_MS;

const VB = 400;

/** The design system's `bg` tweak default — a 150° gradient, not a flat fill. */
export const LAUNCH_BG_TOP = "#16294a";
export const LAUNCH_BG_BOTTOM = "#0d1a30";
const BLUE_1 = "#1d4ed8";
const BLUE_2 = "#3b82f6";

type Pt = [number, number];
const M = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x + 17.5, y + 24] as Pt);

// The finished mark, traced from the icon.
const STEM = M([[128, 90], [173, 90], [99, 262], [60, 262]]);
const FOOT = M([[106, 228], [214, 228], [201, 262], [91, 262]]);
const ARM1 = M([[222, 90], [145, 250], [181, 250], [231, 146]]);
const ARM2 = M([[222, 90], [305, 262], [270, 262], [222, 165]]);

// The thick slash it grows from, centred on the mark.
const HALF_L = M([[155, 90], [200, 90], [126, 262], [81, 262]]);
const HALF_A = M([[200, 90], [126, 262], [171, 262], [245, 90]]);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inCubic = (t: number) => t * t * t;
const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const inOutCubic = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2;
/** Overshoot-and-settle. `s` sets how far past the target it travels. */
const backOut = (t: number, s: number) =>
  t >= 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
/** Decaying oscillation — the landing wobble. */
const wobble = (t: number, f: number, d: number) =>
  t <= 0 ? 0 : Math.sin(t * f) * Math.exp(-t * d);

const mix = (a: Pt[], b: Pt[], t: number): Pt[] =>
  a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)] as Pt);
const pstr = (pts: Pt[]) =>
  pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

/** Transform about an arbitrary pivot, as an SVG transform string. */
const xf = (
  px: number,
  py: number,
  o: { tx?: number; ty?: number; sx?: number; sy?: number; rot?: number }
) => {
  const { tx = 0, ty = 0, sx = 1, sy = 1, rot: r = 0 } = o;
  return `translate(${tx} ${ty}) translate(${px} ${py}) rotate(${r}) scale(${sx} ${sy}) translate(${-px} ${-py})`;
};

interface Frame {
  drop: number;
  squash: number;
  tilt: number;
  split: number;
  kick: number;
  spring: number;
  wash: number;
  ring: number;
  scale: number;
  opacity: number;
  glow: number;
}

/** Every per-frame value; `c` runs 0→1 across both scenes. */
function frameAt(c: number): Frame {
  if (c < FORM_FRAC) {
    const p = clamp01(c / FORM_FRAC);
    const enter = seg(p, 0, 0.26);
    return {
      drop: lerp(-820, 0, backOut(enter, 1.5)),
      squash:
        1 -
        0.26 * wobble(seg(p, 0.2, 0.62) * 6, 5.4, 2.4) +
        0.3 * (1 - enter) * (1 - enter),
      tilt: -3.5 * wobble(seg(p, 0.24, 0.8) * 6, 4.4, 2.8),
      split: backOut(seg(p, 0.3, 0.6), 2.0),
      kick: backOut(seg(p, 0.56, 0.8), 2.8),
      spring: backOut(seg(p, 0.64, 0.9), 3.0),
      wash: backOut(seg(p, 0.82, 1), 1.6),
      ring: seg(p, 0.82, 1),
      scale: 1 + 0.05 * wobble(seg(p, 0.84, 1) * 6, 6, 3),
      opacity: 1,
      glow: seg(p, 0.6, 1),
    };
  }
  const p = clamp01((c - FORM_FRAC) / (1 - FORM_FRAC));
  const out = inCubic(seg(p, 0.4, 1));
  return {
    drop: 0,
    squash: 1 - 0.03 * wobble(seg(p, 0, 0.5) * 6, 5.5, 3),
    tilt: 0,
    split: 1,
    kick: 1,
    spring: 1,
    wash: 1,
    ring: 1,
    scale: 1 + out * 0.24,
    opacity: 1 - inOutCubic(seg(p, 0.45, 0.99)),
    glow: 1 - out,
  };
}

const BASE: Pt = [200, 286];
const APEX: Pt = [239.5, 114];
const FOOT_PIVOT: Pt = [123.5, 274];

export function LaunchAnimation({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  // 620 of the study's 1080-wide stage, kept proportional so the mark occupies
  // the same share of every screen.
  const size = Math.min(width * 0.574, 620);
  const glowSize = size * 1.5;

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
  const armPts = pstr(mix(HALF_A, ARM1, f.split));
  const bodyXf = xf(BASE[0], BASE[1], {
    ty: f.drop,
    sy: f.squash,
    sx: 2 - f.squash,
    rot: f.tilt,
  });
  const springXf = xf(APEX[0], APEX[1], { sx: f.spring, sy: f.spring });

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.veil, { opacity: f.opacity }]}
      pointerEvents={f.opacity < 0.02 ? "none" : "auto"}
      testID="launch-animation"
    >
      {/* The 150° background gradient the study specifies. */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={LAUNCH_BG_TOP} />
            <Stop offset="1" stopColor={LAUNCH_BG_BOTTOM} />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#bg)" />
      </Svg>

      <View
        style={{
          position: "absolute",
          width: glowSize,
          height: glowSize,
          opacity: f.glow * 0.4,
          transform: [{ scale: lerp(0.8, 1, f.glow) }],
        }}
        pointerEvents="none"
      >
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={BLUE_2} stopOpacity={0.24} />
              <Stop offset="0.42" stopColor={BLUE_2} stopOpacity={0.07} />
              <Stop offset="0.7" stopColor={BLUE_2} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={glowSize} height={glowSize} fill="url(#glow)" />
        </Svg>
      </View>

      <View style={{ transform: [{ scale: f.scale }] }}>
        <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
          <Defs>
            <LinearGradient
              id="ic-white"
              x1="90"
              y1="100"
              x2="240"
              y2="290"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor="#ffffff" />
              <Stop offset="1" stopColor="#e2e9f4" />
            </LinearGradient>
            <LinearGradient
              id="ic-blue"
              x1="160"
              y1="140"
              x2="325"
              y2="286"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={BLUE_1} />
              <Stop offset="1" stopColor={BLUE_2} />
            </LinearGradient>
            <ClipPath id="ic-wash">
              <Rect x="0" y="100" width={VB} height={200 * f.wash} />
            </ClipPath>
          </Defs>

          {f.ring > 0 && f.ring < 1 && (
            <Circle
              cx={APEX[0]}
              cy={190}
              r={20 + 190 * outCubic(f.ring)}
              fill="none"
              stroke={BLUE_2}
              strokeWidth={7 * (1 - f.ring)}
              opacity={0.4 * (1 - f.ring)}
            />
          )}

          <G transform={bodyXf}>
            <Polygon points={pstr(mix(HALF_L, STEM, f.split))} fill="url(#ic-white)" />
            <Polygon points={armPts} fill="url(#ic-white)" />
            <G transform={springXf}>
              <Polygon points={pstr(ARM2)} fill="url(#ic-white)" />
            </G>
            {/* The blue wash sweeping down over the A. */}
            <G clipPath="url(#ic-wash)">
              <Polygon points={armPts} fill="url(#ic-blue)" />
              <G transform={springXf}>
                <Polygon points={pstr(ARM2)} fill="url(#ic-blue)" />
              </G>
            </G>
            <G transform={xf(FOOT_PIVOT[0], FOOT_PIVOT[1], { sx: f.kick })}>
              <Polygon points={pstr(FOOT)} fill="url(#ic-white)" />
            </G>
          </G>
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  veil: {
    backgroundColor: LAUNCH_BG_BOTTOM,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
});
