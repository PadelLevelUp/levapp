import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AttendanceGranularity,
  PresencePlayerStats,
  PresenceStatsTotals,
  AttendanceBucket,
} from "@/types";

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>
      <div className="h-56 w-full">{children}</div>
    </div>
  );
}

/**
 * PAD-140 — three views of the same roster.
 *
 * `isAnimationActive={false}` on every series is load-bearing, not styling:
 * Recharts leaves bars as empty `<g>` elements when the mount animation runs
 * under a throttled rAF (headless tests, background tabs), so an animated chart
 * can render blank. `AttendanceChart` carries the same note.
 */
export function PresenceCharts({
  players,
  totals,
  trend,
  granularity,
  loading,
  scope,
}: {
  players: PresencePlayerStats[];
  totals?: PresenceStatsTotals;
  trend: AttendanceBucket[];
  granularity: AttendanceGranularity;
  loading?: boolean;
  /**
   * PAD-192: set while the table's filters narrow the roster. The charts are
   * then derived from the filtered rows, and this caption says so — nobody
   * should read a one-player chart as the whole academy.
   */
  scope?: { shown: number; total: number } | null;
}) {
  const { t, i18n } = useTranslation();

  const topPlayers = useMemo(
    () =>
      [...players]
        .filter((p) => p.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)
        .map((p) => {
          // "Miguel Ferreira" -> "Miguel F." so eight labels fit the axis.
          const [first = "", last = ""] = p.name.split(" ");
          return {
            name: last ? `${first} ${last.charAt(0)}.` : first,
            presences: p.total,
          };
        }),
    [players]
  );

  const split = useMemo(
    () => [
      { key: "private", name: t("presences.type.private"), value: totals?.private ?? 0 },
      { key: "academy", name: t("presences.type.academy"), value: totals?.academy ?? 0 },
    ],
    [totals, t]
  );

  const trendData = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, {
      ...(granularity === "year"
        ? { year: "numeric" }
        : granularity === "month"
          ? { month: "short" }
          : { day: "numeric", month: "short" }),
      timeZone: "UTC",
    });
    return trend.map((bucket) => ({
      label: fmt.format(new Date(`${bucket.start}T00:00:00Z`)),
      presences: bucket.count,
    }));
  }, [trend, granularity, i18n.language]);

  const barConfig = {
    presences: {
      label: t("presences.charts.seriesLabel"),
      color: "hsl(var(--primary))",
    },
  } satisfies ChartConfig;

  const pieConfig = {
    private: { label: t("presences.type.private"), color: "hsl(var(--primary))" },
    academy: { label: t("presences.type.academy"), color: "hsl(var(--muted-foreground))" },
  } satisfies ChartConfig;

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {scope && (
        <p
          data-testid="presences-charts-scope"
          className="text-xs font-medium text-muted-foreground"
        >
          {t("presences.charts.following", { shown: scope.shown, total: scope.total })}
        </p>
      )}
    <div className="grid gap-4 lg:grid-cols-3" data-testid="presences-charts">
      <ChartCard
        title={t("presences.charts.perPlayer")}
        subtitle={t("presences.charts.perPlayerHint")}
      >
        {topPlayers.length === 0 ? (
          <EmptyChart />
        ) : (
          <ChartContainer config={barConfig} className="h-full w-full aspect-auto">
            <BarChart data={topPlayers} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={54}
                fontSize={11}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar
                dataKey="presences"
                fill="var(--color-presences)"
                radius={[5, 5, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartContainer>
        )}
      </ChartCard>

      <ChartCard
        title={t("presences.charts.split")}
        subtitle={t("presences.charts.splitHint")}
      >
        {split.every((s) => s.value === 0) ? (
          <EmptyChart />
        ) : (
          <ChartContainer config={pieConfig} className="h-full w-full aspect-auto">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
              <Pie
                data={split}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={78}
                paddingAngle={3}
                isAnimationActive={false}
              >
                {split.map((slice) => (
                  <Cell key={slice.key} fill={`var(--color-${slice.key})`} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </ChartCard>

      <ChartCard
        title={t("presences.charts.overTime")}
        subtitle={t("presences.charts.overTimeHint")}
      >
        {trendData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ChartContainer config={barConfig} className="h-full w-full aspect-auto">
            <LineChart data={trendData} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="presences"
                stroke="var(--color-presences)"
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </ChartCard>
    </div>
    </div>
  );
}

function EmptyChart() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {t("presences.charts.empty")}
    </div>
  );
}
