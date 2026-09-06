/**
 * The student's four numbers, each with the context that makes it readable.
 *
 * Shaped like `StatCard` — label, display-face number, sub line — rather than
 * the old icon-and-number tile, because a bare "12" says nothing; "12 · of 15
 * lessons" does. The tile ids (`dashboard-kpi-<slug>`), `data-clickable` and
 * the button role for tiles with a destination are unchanged: they are what
 * `dashboard.navigation` rules 6, 7, 11 and 11a are tested through.
 */
import type { DashboardKpiGridBlock } from "@levelup/types";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./primitives";

type KpiItem = DashboardKpiGridBlock["data"]["items"][number];

/** "Upcoming lessons" → "upcoming-lessons" — stable key for dashboard-kpi-<key>. */
export function kpiKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * PAD-77: the backend emits KPI labels as English literals. The stable slug maps
 * to an i18n key so the tile respects the selected language; unknown slugs fall
 * back to the raw label.
 */
const KPI_LABEL_KEYS: Record<string, string> = {
  attended: "dashboard.kpi.attended",
  missed: "dashboard.kpi.missed",
  "upcoming-lessons": "dashboard.kpi.upcomingLessons",
  invites: "dashboard.kpi.invites",
};

export function KpiTiles({ block }: { block: DashboardKpiGridBlock }) {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-2.5" data-testid="dashboard-kpis">
      <Eyebrow className="px-1">{t("dashboard.kpi.eyebrow")}</Eyebrow>
      <div className="grid grid-cols-2 gap-2.5">
        {block.data.items.map((item) => (
          <KpiTile key={item.label} item={item} />
        ))}
      </div>
    </section>
  );
}

/** The sub line: a denominator where the server sent one, fixed context otherwise. */
function subFor(item: KpiItem, slug: string, t: (k: string, o?: Record<string, unknown>) => string) {
  if (typeof item.total === "number") return t("dashboard.kpi.ofLessons", { count: item.total });
  if (slug === "upcoming-lessons") return t("dashboard.kpi.next30Days");
  if (slug === "invites") return t("dashboard.kpi.toConfirm");
  return "";
}

function KpiTile({ item }: { item: KpiItem }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const slug = kpiKey(item.label);
  const labelKey = KPI_LABEL_KEYS[slug];
  const label = labelKey ? t(labelKey) : item.label;
  // PAD-76: no href → inert card, never a link to the 404 page.
  const href = item.href;
  const go = () => href && navigate(href);

  return (
    <div
      data-testid={`dashboard-kpi-${slug}`}
      data-clickable={href ? "true" : "false"}
      {...(href
        ? {
            role: "button",
            tabIndex: 0,
            onClick: go,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                go();
              }
            },
          }
        : {})}
      className={cn(
        // Border, not shadow — a tile in a grid.
        "flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4",
        href &&
          "cursor-pointer transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
      )}
    >
      <span className="text-[13px] font-semibold text-muted-foreground">{label}</span>
      {/* The number gets its own id: a tile now also carries its denominator,
          so a test that wants the value must not scrape the whole tile. */}
      <span
        data-testid={`dashboard-kpi-${slug}-value`}
        className="font-display text-2xl font-bold tracking-tight tabular-nums"
      >
        {item.prefix ?? ""}
        {item.value}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{subFor(item, slug, t)}</span>
    </div>
  );
}
