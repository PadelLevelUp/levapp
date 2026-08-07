import Svg, { Defs, G, LinearGradient, Path, Stop } from "react-native-svg";

/**
 * The LevApp L+A monogram, transcribed from
 * `.claude/skills/levapp-design-system/assets/logo/levapp-mark-on-dark.svg`.
 *
 * Inlined as react-native-svg rather than shipped as a PNG so it stays sharp
 * at every density and keeps the blue gradient the brand mark actually uses.
 * The geometry is vector-drawn, not traced, so it holds down to 24px — which
 * is the system's stated minimum.
 *
 * `onDark` swaps the L's keyline for the light-surface variant. The gradient
 * on the A never changes: the mark must not be recoloured.
 */
export function LevAppMark({ size = 28, onDark = true }: { size?: number; onDark?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="LevApp">
      <Defs>
        <LinearGradient id="levA" x1="0.05" y1="0.05" x2="0.95" y2="0.95">
          <Stop offset="0" stopColor="#4A9BFF" />
          <Stop offset="0.46" stopColor="#1355DC" />
          <Stop offset="1" stopColor="#2F8AFF" />
        </LinearGradient>
      </Defs>
      <G transform="translate(-99, 38)">
        <Path d="M730 248 L952 700 L856 700 L730 442 L604 700 L508 700 Z" fill="url(#levA)" />
        <Path
          d="M470 248 L596 248 L438 618 L706 618 L676 700 L288 700 Z"
          fill="none"
          stroke={onDark ? "#0D1B31" : "#FFFFFF"}
          strokeWidth={38}
          strokeLinejoin="round"
        />
        <Path
          d="M470 248 L596 248 L438 618 L706 618 L676 700 L288 700 Z"
          fill={onDark ? "#FFFFFF" : "#0D1B31"}
        />
      </G>
    </Svg>
  );
}
