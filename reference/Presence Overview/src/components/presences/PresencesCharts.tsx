import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { topPlayers, typeSplit, weeklyPresences } from "@/lib/presences-data";

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
      <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--card)",
  fontSize: 12,
  color: "var(--card-foreground)",
};

export function PresencesCharts() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard title="Presences per player" subtitle="Top 8 players">
        <BarChart data={topPlayers} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={54} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
          <Bar dataKey="presences" fill="var(--chart-1)" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Private vs Academy" subtitle="Share of all presences">
        <PieChart>
          <Pie data={typeSplit} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="var(--card)">
            {typeSplit.map((_, i) => (
              <Cell key={i} fill={i === 0 ? "var(--chart-1)" : "var(--chart-2)"} />
            ))}
          </Pie>
          <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ChartCard>

      <ChartCard title="Presences over time" subtitle="Last 8 weeks">
        <LineChart data={weeklyPresences} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="presences" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ChartCard>
    </div>
  );
}
