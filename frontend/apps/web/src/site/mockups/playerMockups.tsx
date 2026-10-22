/**
 * PAD-656: the players page's mockups, drawn in HTML as the FINAL design does. The coach "Duarte
 * Lopes" and the chat are the design's fictitious mock data; UI labels come from `site.players.*`.
 */
import { CalendarDays, Clock, LayoutDashboard, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { useList } from "../pages/useList";
import { cardShadow, Phone } from "../sections/primitives";

/** A coach's invitations in the student's chat, with the app's bottom tabs (O que ganhas). */
export function PlayerChatMockup() {
  const { t } = useTranslation();
  const list = useList<string>();
  const tabs = list("site.players.benefits.tabs");
  const icons = [LayoutDashboard, CalendarDays, Clock, MessageSquare];
  return (
    <div role="img" aria-label={t("site.players.benefits.chatLabel")} data-testid="site-player-chat-mockup">
      <Phone time="18:06">
        <div className="border-b border-site-border px-4 py-2 text-[13px] font-semibold text-site-ink">← Duarte Lopes · Treinador</div>
        <div className="flex flex-col gap-2 p-3 text-[12px]">
          <div className="max-w-[88%] self-start rounded-2xl bg-site-surface px-3 py-2 text-site-ink">
            Olá Ana, abriu uma vaga na terça 20/10 às 19:00. Queres vir?<div className="mt-1 text-right text-[10px] text-site-faint">09:12</div>
          </div>
          <span className="self-start rounded-full bg-site-green-bg px-2 py-0.5 text-[11px] font-semibold text-site-green-text">✓ Aceite</span>
          <div className="max-w-[88%] self-start rounded-2xl bg-site-surface px-3 py-2 text-site-ink">
            Top! Contamos contigo. Até já!<div className="mt-1 text-right text-[10px] text-site-faint">09:13</div>
          </div>
          <div className="my-1 text-center text-[10px] uppercase tracking-wide text-site-faint">Mensagens não lidas</div>
          <div className="max-w-[88%] self-start rounded-2xl bg-site-surface px-3 py-2 text-site-ink">
            Olá Ana, abriu uma vaga na quinta 22/10 às 19:00. Queres vir?<div className="mt-1 text-right text-[10px] text-site-faint">18:05</div>
          </div>
          <div className="flex gap-2 self-start">
            <span className="rounded-lg bg-site-primary px-4 py-1.5 font-semibold text-white">Sim</span>
            <span className="rounded-lg border border-site-border-strong px-4 py-1.5 font-semibold text-site-ink">Não</span>
          </div>
        </div>
        <div className="mx-3 mt-2 rounded-full border border-site-border px-4 py-2 text-[12px] text-site-faint">{t("site.players.benefits.composer")}</div>
        <div className="mt-3 grid grid-cols-4 gap-0.5 border-t border-site-border px-1 py-2 text-[9px] leading-tight text-site-muted">
          {tabs.map((tab, i) => {
            const Icon = icons[i] ?? MessageSquare;
            return (
              <span key={tab} className={cn("flex min-w-0 flex-col items-center gap-0.5 text-center [overflow-wrap:anywhere]", i === 3 && "text-site-primary")}>
                <Icon className="h-4 w-4" aria-hidden />
                {tab}
              </span>
            );
          })}
        </div>
      </Phone>
    </div>
  );
}

/** A recurring work block and what it does to two spots (Disponibilidade). */
export function AvailabilityMockup() {
  const { t } = useTranslation();
  const list = useList<string>();
  const a = (k: string) => t(`site.players.availability.${k}`);
  const letters = list("site.players.availability.dayLetters");
  const on = new Set([0, 2, 4]);
  const field = "rounded-xl bg-site-surface px-3 py-2 text-[13px] text-site-ink";
  return (
    <div role="img" aria-label={a("label")} data-testid="site-availability-mockup" className="flex w-full max-w-[420px] flex-col gap-4">
      <div className={cn("rounded-[20px] border border-site-border bg-white p-5", cardShadow)}>
        <div className="font-display text-[18px] font-bold text-site-ink">{a("formTitle")}</div>
        <p className="mb-3 text-[13px] text-site-muted">{a("formSub")}</p>
        <div className="mb-3 grid grid-cols-2 rounded-xl bg-site-surface p-1 text-center text-[13px]">
          <span className="py-1.5 text-site-muted">{a("once")}</span>
          <span className="rounded-lg bg-white py-1.5 font-semibold text-site-ink shadow-sm">{a("recurring")}</span>
        </div>
        <div className="mb-1 text-[12px] font-semibold text-site-muted">{a("days")}</div>
        <div className="mb-3 flex gap-1.5">
          {letters.map((d, i) => (
            <span key={`${d}${i}`} className={cn("grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold", on.has(i) ? "bg-site-primary text-white" : "bg-site-surface text-site-muted")}>
              {d}
            </span>
          ))}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[12px] font-semibold text-site-muted">{a("start")}</div>
            <div className={field}>09:00</div>
          </div>
          <div>
            <div className="mb-1 text-[12px] font-semibold text-site-muted">{a("end")}</div>
            <div className={field}>18:00</div>
          </div>
        </div>
        <div className="mb-1 text-[12px] font-semibold text-site-muted">{a("reason")}</div>
        <div className={cn(field, "mb-4")}>{a("reasonValue")}</div>
        <span className="block rounded-xl bg-site-primary py-2 text-center text-[14px] font-semibold text-white">{a("save")}</span>
      </div>
      <div className="rounded-2xl border border-site-border bg-white p-4 text-[13px]">
        <div className="flex items-center justify-between font-semibold text-site-ink">
          <span>{a("blockTitle")}</span>
          <span className="rounded-full bg-site-amber-bg px-2 py-0.5 text-[11px] text-site-amber">{a("blockState")}</span>
        </div>
        <div className="text-site-muted">{a("blockWhen")}</div>
        <div className="mt-1 text-[12px] text-site-faint">{a("blockNote")}</div>
      </div>
      <div className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
        <div className="rounded-xl bg-site-green-bg p-3">
          <div className="font-semibold text-site-ink">{a("rowYes")}</div>
          <div className="font-semibold text-site-green-text">{a("rowYesState")}</div>
          <div className="text-[12px] text-site-muted">{a("rowYesNote")}</div>
        </div>
        <div className="rounded-xl bg-site-surface p-3">
          <div className="font-semibold text-site-ink">{a("rowNo")}</div>
          <div className="font-semibold text-site-muted">{a("rowNoState")}</div>
          <div className="text-[12px] text-site-muted">{a("rowNoNote")}</div>
        </div>
      </div>
    </div>
  );
}
