import { lightTheme } from "@levelup/config";
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  axisMax,
  axisTicks,
  barRects,
  labelIndices,
  linePoints,
  polylinePoints,
  yFor,
  type ChartPoint,
} from "./chart-geometry";

export type { ChartPoint } from "./chart-geometry";

const Y_AXIS_WIDTH = 28;
const X_AXIS_HEIGHT = 20;

/**
 * PAD-162 — the app's chart primitive.
 *
 * There is no Recharts on React Native, so this draws with `react-native-svg`.
 * It is deliberately generic — a series of `{ label, value }` rendered as bars
 * or a line — because it has three known consumers: the attendance history
 * here, the absences history (PAD-163) and Presences reporting (PAD-166). All
 * three plot one measure over ordered time periods, which is the one form this
 * component covers. It is not a charting library and should not grow into one:
 * a second measure, a second encoding or a legend means a different component.
 *
 * Design follows web's `AttendanceChart`: one series means no legend and no
 * colour encoding to decode — identity is carried by the axis, magnitude by
 * bar height. The grid is horizontal only, so marks read against value lines
 * rather than sitting in a cage. The fill defaults to the app's primary token
 * so the chart is themed, not hardcoded.
 *
 * Marks are drawn synchronously; nothing here animates. That is the same
 * decision web's chart records for a load-bearing reason (a grow-in animation
 * that never advances leaves an empty chart that reads as "no data"), and a
 * count-per-period chart gains nothing from it either way.
 *
 * Width comes from `onLayout`: SVG needs pixels, and a percentage width on the
 * `Svg` element does not give the geometry something to scale against. Nothing
 * is drawn until the first layout pass reports a width.
 */
export function Chart({
  data,
  variant = "bar",
  height = 200,
  color = lightTheme.primary,
  emptyLabel,
  accessibilityLabel,
  testID,
  className,
  maxLabels = 7,
}: {
  data: ChartPoint[];
  variant?: "bar" | "line";
  height?: number;
  color?: string;
  /** Rendered over the plot when every value is zero. */
  emptyLabel?: string;
  accessibilityLabel?: string;
  testID?: string;
  className?: string;
  maxLabels?: number;
}) {
  const [width, setWidth] = React.useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  const values = data.map((d) => d.value);
  const yMax = axisMax(values);
  const ticks = axisTicks(yMax);
  const isEmpty = values.every((v) => v === 0);

  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);
  const plotHeight = Math.max(0, height - X_AXIS_HEIGHT);
  const shown = labelIndices(data.length, maxLabels);

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      className={cn("w-full", className)}
      style={{ height }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {/* Value lines and their labels. */}
          {ticks.map((tick) => {
            const y = yFor(tick, yMax, plotHeight);
            return (
              <G key={`tick-${tick}`}>
                <Line
                  x1={Y_AXIS_WIDTH}
                  y1={y}
                  x2={width}
                  y2={y}
                  stroke={lightTheme.border}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <SvgText
                  x={Y_AXIS_WIDTH - 6}
                  y={y + 4}
                  fontSize={10}
                  textAnchor="end"
                  fill={lightTheme.mutedForeground}
                >
                  {String(tick)}
                </SvgText>
              </G>
            );
          })}

          <G x={Y_AXIS_WIDTH}>
            {variant === "bar"
              ? barRects(values, yMax, plotWidth, plotHeight).map((r, i) => (
                  <Rect
                    key={`bar-${i}`}
                    x={r.x}
                    y={r.y}
                    width={r.width}
                    height={r.height}
                    // react-native-svg rounds all four corners; web rounds only
                    // the data end. Clamped so a short bar is not a lozenge.
                    rx={Math.min(4, r.height / 2)}
                    fill={color}
                  />
                ))
              : (() => {
                  const points = linePoints(
                    values,
                    yMax,
                    plotWidth,
                    plotHeight
                  );
                  return (
                    <G>
                      <Polyline
                        points={polylinePoints(points)}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      {points.map((p, i) => (
                        <Circle
                          key={`point-${i}`}
                          cx={p.x}
                          cy={p.y}
                          r={2.5}
                          fill={color}
                        />
                      ))}
                    </G>
                  );
                })()}

            {/* Axis ticks, thinned so a month of days stays readable. */}
            {shown.map((i) => {
              const slot = data.length > 0 ? plotWidth / data.length : 0;
              return (
                <SvgText
                  key={`label-${i}`}
                  x={i * slot + slot / 2}
                  y={plotHeight + 14}
                  fontSize={10}
                  textAnchor="middle"
                  fill={lightTheme.mutedForeground}
                >
                  {data[i].label}
                </SvgText>
              );
            })}
          </G>
        </Svg>
      ) : null}

      {isEmpty && emptyLabel ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <Text className="text-sm text-muted-foreground">{emptyLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}
