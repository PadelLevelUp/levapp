import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, TrendingUp, UserCheck, Users } from "lucide-react";
import { PresencesCharts } from "@/components/presences/PresencesCharts";
import { PlayersTable } from "@/components/presences/PlayersTable";
import { ValidateClasses } from "@/components/presences/ValidateClasses";
import { players, typeSplit } from "@/lib/presences-data";

export const Route = createFileRoute("/")({
  component: PresencesTab,
  head: () => ({
    meta: [
      { title: "Presences — Padel Coach Attendance Dashboard" },
      {
        name: "description",
        content:
          "Track padel student attendance: presences per player, private vs academy split, weekly trends and a sortable, filterable players table.",
      },
      { property: "og:title", content: "Presences — Padel Coach Attendance Dashboard" },
      {
        property: "og:description",
        content:
          "Coach dashboard prototype for padel attendance: charts, filters, custom columns and CSV export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-lg font-semibold leading-tight text-card-foreground tabular-nums">{value}</span>
        <span className="block text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

function PresencesTab() {
  const total = players.reduce((s, p) => s + p.total, 0);
  const unjustified = players.reduce((s, p) => s + p.unjustified, 0);
  const guests = players.reduce((s, p) => s + p.invitesJoined, 0);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Padel Coach · Attendance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Presences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Attendance across private and academy classes, including guests joining by invite.
          </p>
        </header>

        <div className="mb-4 sm:max-w-sm">
          <ValidateClasses />
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={CalendarCheck} label="Total presences" value={String(total)} />
          <Stat icon={Users} label="Active players" value={String(players.length)} />
          <Stat
            icon={TrendingUp}
            label="Academy share"
            value={`${Math.round(((typeSplit[1]?.value ?? 0) / (total || 1)) * 100)}%`}
          />
          <Stat icon={UserCheck} label="Guest attendances" value={String(guests)} />
        </div>

        <div className="space-y-6">
          <PresencesCharts />
          <PlayersTable />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Prototype with mock data · {unjustified} unjustified absences recorded
        </p>
      </div>
    </main>
  );
}
