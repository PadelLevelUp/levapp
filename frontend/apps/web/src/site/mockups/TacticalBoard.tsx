/**
 * PAD-656: the tactical-board mock in the Resultados section. A dark card with three tabs, a toolbar
 * and a blue court where the four players and the ball loop on a 6 s CSS animation. The keyframes
 * live in a scoped <style> (`lvq-` prefix) and are switched off under prefers-reduced-motion.
 */
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export const BOARD_CSS = `
.lvq-ball{animation:lvq-ball 6s ease-in-out infinite}
.lvq-a1{animation:lvq-a1 6s ease-in-out infinite}
.lvq-b1{animation:lvq-b1 6s ease-in-out infinite}
@keyframes lvq-ball{0%,8%{left:76%;top:80%}30%{left:24%;top:18%}52%{left:28%;top:74%}76%{left:72%;top:22%}100%{left:76%;top:80%}}
@keyframes lvq-a1{0%,15%{left:24%;top:14%}30%,60%{left:24%;top:18%}80%,100%{left:24%;top:14%}}
@keyframes lvq-b1{0%,30%{left:26%;top:80%}50%,70%{left:28%;top:76%}100%{left:26%;top:80%}}
@media (prefers-reduced-motion: reduce){.lvq-ball,.lvq-a1,.lvq-b1{animation:none}}
`;

const TABS = [
  { key: "free", active: false },
  { key: "tactics", active: true },
  { key: "basket", active: false },
] as const;
const CHIPS = ["select", "ball", "move", "cone"] as const;
const LINE = "absolute bg-white/80";
const token = "absolute grid h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[11px] font-bold";

const PLAYERS = [
  { id: "A1", left: "24%", top: "14%", cls: "lvq-a1 bg-[#9CC6FF] text-[#0D1B31]" },
  { id: "A2", left: "72%", top: "15%", cls: "bg-[#9CC6FF] text-[#0D1B31]" },
  { id: "B1", left: "26%", top: "80%", cls: "lvq-b1 bg-[#D3453B] text-white" },
  { id: "B2", left: "76%", top: "82%", cls: "bg-[#D3453B] text-white ring-[3px] ring-white" },
];

export function TacticalBoard({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div data-testid="site-tactical-board" className={cn("w-full min-w-0", className)}>
      <style>{BOARD_CSS}</style>
      <div
        role="img"
        aria-label={t("site.coaches.board.label")}
        className="max-w-full overflow-hidden rounded-[22px] bg-[#101C30] text-white"
      >
        <div className="border-b border-[#24374F] px-[18px] py-3.5">
          <span className="text-[15px] font-bold">LEV APP</span>
          <span className="ml-2 text-[10px] tracking-[0.12em] text-[#A9BCD6]">· {t("site.coaches.board.title")}</span>
        </div>
        <div className="grid grid-cols-3 border-b border-[#24374F]">
          {TABS.map(({ key, active }) => (
            <div
              key={key}
              className={cn("min-w-0 border-b-2 px-1.5 py-3 text-center", active ? "border-[#4A9BFF] bg-[#16294A]" : "border-transparent")}
            >
              <div className={cn("text-[12.5px] font-bold", active ? "text-white" : "text-[#A9BCD6]")}>{t(`site.coaches.board.tab.${key}`)}</div>
              <div className="mt-0.5 text-[8.5px] tracking-[0.1em] text-[#7E90AB]">{t(`site.coaches.board.tab.${key}Sub`)}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
          {CHIPS.map((chip, i) => (
            <span
              key={chip}
              className={cn(
                "rounded-[10px] border px-2.5 py-2 text-[8.5px] font-semibold tracking-[0.06em] text-[#DCE4F0]",
                i === 0 ? "border-[#2854D4] bg-[#16294A]" : "border-[#2E4460]",
              )}
            >
              {t(`site.coaches.board.chip.${chip}`)}
            </span>
          ))}
          <span className="flex-1" />
          <span className="text-[11px] text-[#DCE4F0] [font-variant-numeric:tabular-nums]">{t("site.coaches.board.step")}</span>
          <span className="rounded-full bg-[#2854D4] px-3 py-1.5 text-[11px] font-bold">{t("site.coaches.board.auto")}</span>
        </div>
        <div className="flex flex-col items-center px-4 pb-5 pt-1">
          <div className="mb-1.5 text-[9px] tracking-[0.14em] text-[#7E90AB]">{t("site.coaches.board.teamA")}</div>
          <div
            className="relative box-border max-w-full border-2 border-white/85 bg-[#2A62D6]"
            style={{ width: "min(230px, 100%)", aspectRatio: "230 / 400" }}
          >
            <span className={cn(LINE, "inset-x-0 top-[30%] h-[1.5px]")} />
            <span className={cn(LINE, "inset-x-0 top-[70%] h-[1.5px]")} />
            <span className={cn(LINE, "inset-y-0 left-1/2 w-[1.5px]")} />
            <span className="absolute inset-x-0 top-1/2 -mt-0.5 h-1 border-y-[1.5px] border-white" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="absolute inset-0 h-full w-full">
              <polyline points="76,80 24,18 28,74 72,22" fill="none" stroke="#E5F24A" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity=".7" />
            </svg>
            {PLAYERS.map((p) => (
              <span key={p.id} className={cn(token, p.cls)} style={{ left: p.left, top: p.top }}>
                {p.id}
              </span>
            ))}
            <span
              className="lvq-ball absolute -ml-1.5 -mt-1.5 h-3 w-3 rounded-full bg-[#E5F24A] shadow-[0_0_0_2px_rgba(0,0,0,0.25)]"
              style={{ left: "76%", top: "80%" }}
            />
          </div>
          <div className="mt-1.5 text-[9px] tracking-[0.14em] text-[#7E90AB]">{t("site.coaches.board.teamB")}</div>
        </div>
      </div>
      <p className="mt-4 text-[15px] leading-[1.6] text-site-on-navy-muted">{t("site.coaches.board.caption")}</p>
    </div>
  );
}
