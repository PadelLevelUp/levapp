/**
 * PAD-656 (auth.landing-page): the coaches page's calendar mockup, drawn in HTML/CSS only. The data is
 * fictitious and literal; UI labels come from `site.coaches.calendar.*`. The "now" line is pinned to
 * Wednesday 11:15 (a mock, never the real clock). The legend is a real list OUTSIDE the role="img".
 */
import { Calendar, LayoutDashboard, MessageSquare, Settings, UserPlus, Users, ClipboardCheck, Dumbbell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Lv = 2 | 3 | 4 | 5;
type State = "done" | "running" | "next" | "upcoming" | "full";
interface Palette { light: string; badge: string; badgeFg: string; track: string; fill: string; solid: string; dark: string }

// Level colours: 2 #1A9AD6, 3 #2F6FE4, 4 #4A4FDB, 5 #6B3FCF (solid); light/dark tones as the design draws them.
const LEVELS: Record<Lv, Palette> = {
  2: { light: "#DAEFF8", badge: "#BFE3F4", badgeFg: "#1474A0", track: "#BAE1F3", fill: "#5FB8E2", solid: "#1A9AD6", dark: "#157BAB" },
  3: { light: "#DEE8FB", badge: "#C5D7F7", badgeFg: "#2353AB", track: "#C1D4F7", fill: "#6D9AEC", solid: "#2F6FE4", dark: "#2558B6" },
  4: { light: "#E2E3F9", badge: "#CCCEF5", badgeFg: "#383BA4", track: "#C9CAF4", fill: "#8084E6", solid: "#4A4FDB", dark: "#3B3FAF" },
  5: { light: "#E7E0F7", badge: "#D6C9F2", badgeFg: "#502F9B", track: "#D3C5F1", fill: "#9779DD", solid: "#6B3FCF", dark: "#5632A6" },
};
const PACK = "#14A3B8";
const NOW = { col: 4, row: 6, offset: 15 }; // Wednesday 11:15 (row 6 is 11:00, 30px per half hour)

interface Cls { col: number; row: number; lv: Lv; name: string; time: string; state: State; n: number; wait?: number }
const slot = (row: number, time: string) => ({ row, time });
const A = slot(2, "09:00 – 10:30 · Campo 1");
const B = slot(5, "10:30 – 12:00 · Campo 2");
const C = slot(8, "12:00 – 13:30 · Campo 3");
const D = slot(11, "13:30 – 15:00 · Campo 1");
const CLASSES: Cls[] = [
  { col: 2, ...A, lv: 5, name: "5", state: "done", n: 14 },
  { col: 3, ...A, lv: 5, name: "5", state: "done", n: 10 },
  { col: 4, ...A, lv: 5, name: "5+", state: "done", n: 16 },
  { col: 5, ...A, lv: 5, name: "5", state: "upcoming", n: 12, wait: 2 },
  { col: 6, ...A, lv: 5, name: "5+", state: "full", n: 16 },
  { col: 2, ...B, lv: 2, name: "2", state: "done", n: 13 },
  { col: 3, ...B, lv: 2, name: "2+", state: "done", n: 9 },
  { col: 4, ...B, lv: 2, name: "2", state: "running", n: 14 },
  { col: 5, ...B, lv: 2, name: "2+", state: "full", n: 16 },
  { col: 2, ...C, lv: 3, name: "3", state: "done", n: 15 },
  { col: 3, ...C, lv: 3, name: "3-", state: "done", n: 12 },
  { col: 4, ...C, lv: 3, name: "3", state: "next", n: 13, wait: 2 },
  { col: 5, ...C, lv: 3, name: "3-", state: "upcoming", n: 11, wait: 3 },
  { col: 2, ...D, lv: 4, name: "4", state: "done", n: 16 },
  { col: 3, ...D, lv: 4, name: "4-", state: "done", n: 14 },
  { col: 4, ...D, lv: 4, name: "4", state: "upcoming", n: 13, wait: 1 },
  { col: 5, ...D, lv: 4, name: "4+", state: "full", n: 16 },
];
const PACKS = [{ row: 5, time: "10:30 – 11:30" }, { row: 7, time: "11:30 – 12:30" }, { row: 9, time: "12:30 – 13:30" }];
const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
const DAYS = [{ k: "mon", d: 12 }, { k: "tue", d: 13 }, { k: "wed", d: 14 }, { k: "thu", d: 15 }, { k: "fri", d: 16 }];
const NAV = [
  { k: "dashboard", Icon: LayoutDashboard }, { k: "calendar", Icon: Calendar }, { k: "players", Icon: Users },
  { k: "training", Icon: Dumbbell }, { k: "attendance", Icon: ClipboardCheck }, { k: "requests", Icon: UserPlus },
  { k: "messages", Icon: MessageSquare }, { k: "settings", Icon: Settings },
];
const K = "site.coaches.calendar.";

function Bar({ conf, wait, total, track, fill, waitFill, className }: { conf: number; wait: number; total: number; track: string; fill: string; waitFill: string; className?: string }) {
  return (
    <span className={cn("flex h-1 flex-1 overflow-hidden rounded", className)} style={{ background: track }}>
      <span style={{ width: `${(conf / total) * 100}%`, background: fill }} />
      <span style={{ width: `${(wait / total) * 100}%`, background: waitFill }} />
    </span>
  );
}

function ClassBlock({ c }: { c: Cls }) {
  const { t } = useTranslation();
  const p = LEVELS[c.lv];
  const solid = c.state === "upcoming";
  const dark = c.state === "running" || c.state === "full";
  const next = c.state === "next";
  const done = c.state === "done";
  const bg = done ? p.light : next ? "#FFFFFF" : dark ? p.dark : p.solid;
  const ink = done ? "#2A3547" : next ? p.dark : "#FFFFFF";
  const count = done ? `✓ ${c.n}/16` : `${c.n}/16`;
  return (
    <div
      data-state={c.state}
      className="m-[1px_2px] flex min-w-0 flex-col gap-px overflow-hidden rounded-lg px-[9px] py-[7px] tabular-nums"
      style={{ gridRow: `${c.row} / span 3`, gridColumn: c.col, background: bg, color: done ? "#55627A" : ink, boxShadow: next ? `inset 0 0 0 2px ${p.solid}` : undefined }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: ink }}>ACADEMIA NORTE</span>
        <span className="flex-none rounded px-[5px] py-px text-[10px] font-bold" style={{ background: done || next ? (done ? p.badge : "#E2EBFB") : "rgba(255,255,255,.22)", color: done ? p.badgeFg : ink }}>{c.name}</span>
      </div>
      <div className="text-[10.5px] opacity-85">{c.time}</div>
      {c.state === "running" && (
        <span className="inline-flex items-center gap-1 text-[9.5px] font-bold tracking-[.04em]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#7CF0B5]" />{t(`${K}running`)}
        </span>
      )}
      {next && <span className="text-[9.5px] font-bold tracking-[.04em]" style={{ color: p.solid }}>{t(`${K}next`)}</span>}
      <div className="flex-1" />
      <div className="flex items-center gap-1.5">
        {c.state === "full" ? null : (
          <Bar
            conf={c.n - (c.wait ?? 0)} wait={c.wait ?? 0} total={16}
            track={done ? p.track : next ? "#E4E9F1" : "rgba(255,255,255,.25)"}
            fill={done ? p.fill : next ? p.solid : "#FFFFFF"}
            waitFill={next ? "#ACC5F4" : "rgba(255,255,255,.55)"}
          />
        )}
        {c.state === "full" && <span className="flex-1" />}
        <span className={cn("text-[10.5px]", solid || dark || next ? "font-bold" : "font-semibold")} style={{ color: done ? "#55627A" : ink }}>{count}</span>
      </div>
    </div>
  );
}

function LegendItem({ children, label }: { children: React.ReactNode; label: string }) {
  return <li className="inline-flex items-center gap-[5px]">{children}{label}</li>;
}
const pill = "inline-block h-2 w-4 rounded-full";

export function CalendarMockup() {
  const { t } = useTranslation();
  return (
    <div>
      <div data-testid="site-calendar" className="max-w-full overflow-x-auto rounded-2xl border border-site-border-strong shadow-[0_24px_48px_-28px_rgba(13,27,49,.35)]">
        <div role="img" aria-label={t(`${K}label`)} className="flex min-w-[900px] max-[640px]:min-w-[680px]">
          <div className="flex w-44 flex-none flex-col gap-1 bg-[#0D1B31] px-2.5 py-3.5 max-[640px]:hidden">
            <div className="mb-1.5 flex items-center gap-2 border-b border-white/10 px-1.5 pb-3.5 pt-0.5 font-display text-[17px] font-bold text-white">
              <span className="h-[22px] w-[22px] rounded-[5px] bg-site-primary" />Lev<span className="text-[#4A9BFF]">App</span>
            </div>
            {NAV.map(({ k, Icon }) => (
              <div key={k} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]", k === "calendar" ? "bg-[#1E3453] text-[#4A9BFF]" : "text-[#DCE4F0]")}>
                <Icon size={16} aria-hidden />{t(`${K}nav.${k}`)}
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="flex items-center justify-between border-b border-site-border px-[18px] py-3">
              <span className="text-[17px] font-semibold text-site-ink">{t(`${K}title`)}</span>
              <span className="flex items-center gap-2 text-xs text-site-muted">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-site-wash text-[10px] font-bold text-site-primary">BT</span>Bernardo T.
              </span>
            </div>
            <div className="flex items-center gap-3.5 border-b border-site-border px-[18px] py-3 text-xs">
              <span className="rounded-lg border border-site-border px-3 py-[7px] text-site-ink">{t(`${K}today`)}</span>
              <span className="text-site-muted">‹ &nbsp; ›</span>
              <span className="font-semibold text-site-ink">12–16 out</span>
              <span className="flex-1" />
              <span className="rounded-lg border border-site-border bg-site-surface px-3 py-[7px]">{t(`${K}addEvent`)}</span>
              <span className="rounded-lg bg-site-primary px-3 py-[7px] font-semibold text-white">{t(`${K}addClass`)}</span>
            </div>
            <div className="bg-site-grey pb-4 pr-3">
              <div className="grid grid-cols-[52px_repeat(5,minmax(0,1fr))]">
                <span />
                {DAYS.map(({ k, d }) => (
                  <div key={k} className="border-l border-site-border pb-2 pt-2.5 text-center">
                    <div className={cn("text-[11px] tracking-[.06em]", d === 14 ? "font-semibold text-site-primary" : "text-site-muted")}>{t(`${K}weekdays.${k}`)}</div>
                    <div className={cn("tabular-nums", d === 14 ? "mx-auto mt-0.5 grid h-[30px] w-[30px] place-items-center rounded-full bg-site-primary text-base font-semibold text-white" : "text-xl font-medium")}>{d}</div>
                  </div>
                ))}
              </div>
              <div
                className="grid grid-cols-[52px_repeat(5,minmax(0,1fr))] grid-rows-[repeat(15,30px)] pl-1"
                style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 59px, #E1E6EE 59px, #E1E6EE 60px)", backgroundPosition: "0 30px" }}
              >
                {HOURS.map((h, i) => (
                  <span key={h} className="-translate-y-[7px] text-[10.5px] tabular-nums text-[#8592A8]" style={{ gridRow: 2 + i * 2, gridColumn: 1 }}>{h}</span>
                ))}
                {CLASSES.map((c) => <ClassBlock key={`${c.col}-${c.row}`} c={c} />)}
                {PACKS.map((p) => (
                  <div key={p.row} className="m-[1px_2px] flex min-w-0 flex-col gap-px overflow-hidden rounded-lg px-[9px] py-1.5 text-white" style={{ gridRow: `${p.row} / span 2`, gridColumn: 6, background: PACK }}>
                    <span className="text-xs font-bold">PACK</span>
                    <div className="text-[10.5px] opacity-85">{p.time}</div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1.5">
                      <Bar conf={1} wait={0} total={1} track="rgba(255,255,255,.25)" fill="#FFFFFF" waitFill="transparent" />
                      <span className="text-[10.5px] font-bold">1/1</span>
                    </div>
                  </div>
                ))}
                {DAYS.map((d, i) => (
                  <div key={d.k} data-testid="site-calendar-event" className="m-[1px_2px] rounded-lg border-[1.5px] border-dashed border-site-border-strong bg-white/50 px-[9px] py-[7px]" style={{ gridRow: "14 / span 2", gridColumn: i + 2 }}>
                    <div className="text-xs text-site-muted">Almoço</div>
                    <div className="text-[10.5px] text-[#8592A8]">15:00 – 16:00</div>
                  </div>
                ))}
                <div data-testid="site-calendar-now" className="relative z-[2] mx-0.5 h-0.5 self-start bg-[#E5484D]" style={{ gridRow: NOW.row, gridColumn: NOW.col, marginTop: NOW.offset }} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <ul data-testid="site-calendar-legend" className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-site-muted">
        <LegendItem label={t(`${K}legend.next`)}><span className={pill} style={{ border: "1.5px solid #2F6FE4", background: "#FFFFFF" }} /></LegendItem>
        <LegendItem label={t(`${K}legend.upcoming`)}><span className={pill} style={{ background: "#2F6FE4" }} /></LegendItem>
        <LegendItem label={t(`${K}legend.fullRunning`)}><span className={pill} style={{ background: "#2558B6" }} /></LegendItem>
        <LegendItem label={t(`${K}legend.done`)}><span className={pill} style={{ background: "#D9E5FA" }} /></LegendItem>
        <LegendItem label={t(`${K}legend.event`)}><span className={pill} style={{ border: "1.5px dashed #8592A8" }} /></LegendItem>
        <LegendItem label={t(`${K}legend.bar`)}>
          <span className="inline-flex h-1 w-4 overflow-hidden rounded bg-site-border"><span className="w-1/2 bg-[#2F6FE4]" /><span className="w-1/4 bg-[#A8C1F2]" /></span>
        </LegendItem>
        <LegendItem label={t(`${K}legend.pack`)}><span className={pill} style={{ background: PACK }} /></LegendItem>
        <li className="inline-flex items-center gap-1">
          {t(`${K}legend.levels`)}
          {([2, 3, 4, 5] as Lv[]).map((lv) => <span key={lv} title={`${lv}`} className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: LEVELS[lv].solid }} />)}
        </li>
      </ul>
    </div>
  );
}
