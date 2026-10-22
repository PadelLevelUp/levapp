/**
 * PAD-656: the coaches page's smaller product mockups, drawn in HTML as the FINAL design does. The
 * people, academies and times are the design's fictitious mock data (never real users); the UI
 * labels come from `site.coaches.*`. Each mockup is one image to assistive technology.
 */
import { Bell, Check, FileUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { cardShadow, Phone } from "../sections/primitives";

const mcard = cn("min-w-0 rounded-[20px] border border-site-border bg-white", "shadow-[0_24px_48px_-28px_rgba(13,27,49,0.30)]");

/** Participants and invitees of one class (Vantagens' wide card). */
export function AttendanceMockup() {
  const { t } = useTranslation();
  const a = (k: string) => t(`site.coaches.benefits.attendance.${k}`);
  const people = [
    { name: "Marta Silva", state: "goes" },
    { name: "Pedro Antunes", state: "missed" },
    { name: "Inês Pires", state: "goes" },
    { name: "Rui Costa", state: "goes" },
    { name: "Ana Matos", state: "goes" },
  ];
  const invited = [
    { name: "Joana Reis", ok: false },
    { name: "Tiago Alves", ok: false },
    { name: "Ana Matos", ok: true },
  ];
  return (
    <div role="img" aria-label={a("label")} data-testid="site-attendance-mockup" className={cn(mcard, "w-full max-w-[360px] p-4 text-[13px]")}>
      <div className="mb-2 flex items-center justify-between font-semibold text-site-ink">
        <span>{a("participants")}</span>
        <span className="text-site-primary">{a("edit")}</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {people.map((p) => (
          <li key={p.name} className="flex items-center justify-between rounded-lg bg-site-surface px-3 py-2">
            <span className="truncate">{p.name}</span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", p.state === "missed" ? "bg-site-red-bg text-site-red" : "bg-site-green-bg text-site-green-text")}>{a(p.state)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 font-semibold text-site-ink">{a("invited")}</div>
      <div className="mb-1.5 text-[11px] text-site-faint">{a("onlyFree")}</div>
      <ul className="flex flex-col gap-1.5">
        {invited.map((p) => (
          <li key={p.name} className="flex items-center justify-between rounded-lg border border-site-border px-3 py-2">
            <span className="truncate">{p.name}</span>
            <span className={cn("flex shrink-0 items-center gap-1 text-[11px] font-semibold", p.ok ? "text-site-green-text" : "text-site-red")}>
              {p.ok ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              {a(p.ok ? "accepted" : "declined")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bubble({ children, auto, time }: { children: React.ReactNode; auto?: boolean; time: string }) {
  return (
    <div className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-[12px] leading-snug", auto ? "self-start bg-site-surface text-site-ink" : "self-end bg-site-primary text-white")}>
      {children}
      <div className={cn("mt-1 text-right text-[10px]", auto ? "text-site-faint" : "text-white/70")}>{time}</div>
    </div>
  );
}

/** A lock-screen notification and the chat it opens (Avisos). */
export function NoticesMockup() {
  const { t } = useTranslation();
  return (
    <div role="img" aria-label={t("site.coaches.notices.label")} data-testid="site-notices-mockup" className="flex flex-wrap justify-center gap-6">
      <Phone time="14:42" className="bg-[#0D1B31]">
        <div className="flex flex-col items-center gap-1 pt-6 text-white">
          <span className="text-[12px] opacity-80">sáb. 10/10</span>
          <span className="font-display text-[52px] font-bold leading-none">14:42</span>
        </div>
        <div className="mx-3 mt-6 rounded-2xl bg-white/90 p-3 text-[12px] text-site-ink">
          <div className="mb-1 flex items-center gap-2 text-[11px] text-site-muted">
            <Bell className="h-3.5 w-3.5 text-site-primary" aria-hidden /> LevApp · agora
          </div>
          <div className="font-semibold">Nova mensagem</div>
          <p>Olá Ana, abriu uma vaga no domingo 11/10 às 12:00. Queres vir?</p>
        </div>
      </Phone>
      <Phone time="14:53">
        <div className="border-b border-site-border px-4 py-2 text-[13px] font-semibold text-site-ink">← Bernardo T. · Treinador</div>
        <div className="flex flex-col gap-2 p-3">
          <Bubble auto time="14:42">Olá Ana, abriu uma vaga no domingo 11/10 às 12:00. Queres vir?</Bubble>
          <span className="self-start rounded-full bg-site-green-bg px-2 py-0.5 text-[11px] font-semibold text-site-green-text">✓ Aceite</span>
          <Bubble auto time="14:47">Top! Contamos contigo. Até já!</Bubble>
          <div className="my-1 text-center text-[10px] uppercase tracking-wide text-site-faint">Mensagens não lidas</div>
          <Bubble auto time="14:53">Olá Ana, abriu uma vaga no domingo 11/10 às 13:30. Queres vir?</Bubble>
          <div className="flex gap-2 self-start">
            <span className="rounded-lg bg-site-primary px-4 py-1.5 text-[12px] font-semibold text-white">Sim</span>
            <span className="rounded-lg border border-site-border-strong px-4 py-1.5 text-[12px] font-semibold text-site-ink">Não</span>
          </div>
        </div>
      </Phone>
    </div>
  );
}

/** Two requests from students who already use LevApp (Novos alunos). */
export function NewStudentsMockup() {
  const { t } = useTranslation();
  const n = (k: string) => t(`site.coaches.newStudents.${k}`);
  return (
    <div role="img" aria-label={n("label")} data-testid="site-new-students-mockup" className="flex w-full max-w-[400px] flex-col gap-4">
      <div className={cn(mcard, "p-4 text-[14px]")}>
        <p className="text-site-ink">Tiago Alves pediu uma aula privada no dia 10/10 (sábado) às 18:00.</p>
        <div className="mt-3 flex items-center justify-between text-[12px] text-site-faint">
          <span>ontem · 19:12</span>
          <span className="rounded-full bg-site-green-bg px-2 py-0.5 font-semibold text-site-green-text">✓ {n("accepted")}</span>
        </div>
      </div>
      <div className={cn(mcard, "p-4 text-[14px]")}>
        <p className="text-site-ink">Rita Martins pediu para entrar em ACADEMIA NORTE no dia 12/10 (segunda-feira) às 09:00.</p>
        <div className="mt-3 flex items-center justify-between gap-2 text-[12px] text-site-faint">
          <span>14:57</span>
          <span className="flex gap-2">
            <span className="rounded-lg bg-site-primary px-3 py-1 font-semibold text-white">{n("accept")}</span>
            <span className="rounded-lg border border-site-border-strong px-3 py-1 font-semibold text-site-ink">{n("decline")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** The academy's own court booking beside LevApp's classes (Reservas). */
export function BookingsMockup() {
  const { t } = useTranslation();
  const b = (k: string) => t(`site.coaches.bookings.${k}`);
  return (
    <div role="img" aria-label={b("label")} data-testid="site-bookings-mockup" className="flex w-full max-w-[360px] flex-col gap-3">
      <div className={cn(mcard, "p-4")}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-site-faint">{b("system")}</div>
        <div className="mb-3 text-[13px] text-site-muted">{b("systemSub")}</div>
        {[
          ["1", "09:00"],
          ["2", "10:30"],
          ["3", "12:00"],
        ].map(([court, time]) => (
          <div key={court} className="mb-1.5 flex justify-between rounded-lg bg-site-surface px-3 py-2 text-[13px] text-site-ink">
            <span>
              {b("court")} {court}
            </span>
            <span className="tabular-nums">{time}</span>
          </div>
        ))}
      </div>
      <div className="rounded-xl bg-site-wash px-4 py-3 text-center text-[14px] font-semibold text-site-primary">{b("plus")}</div>
    </div>
  );
}

/** Settings → Import data with one active import (Começar). */
export function ImportMockup() {
  const { t } = useTranslation();
  const i = (k: string) => t(`site.coaches.import.${k}`);
  return (
    <div role="img" aria-label={i("label")} data-testid="site-import-mockup" className={cn("w-full max-w-[460px] overflow-hidden rounded-[20px] border border-site-border bg-white", cardShadow)}>
      <div className="flex items-center gap-2 bg-[#16294A] px-4 py-2.5 text-[12px] text-white/80">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-[#3B4D6B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3B4D6B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#3B4D6B]" />
        </span>
        <span className="truncate">{i("window")}</span>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div>
          <div className="font-display text-[18px] font-bold text-site-ink">{i("cardTitle")}</div>
          <p className="text-[13px] text-site-muted">{i("cardBody")}</p>
        </div>
        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-site-border-strong px-4 py-6 text-center">
          <FileUp className="h-6 w-6 text-site-primary" aria-hidden />
          <span className="text-[14px] font-semibold text-site-ink">{i("drop")}</span>
          <span className="text-[12px] text-site-muted">{i("dropSub")}</span>
          <span className="mt-1 rounded-lg bg-site-primary px-4 py-1.5 text-[12px] font-semibold text-white">{i("browse")}</span>
        </div>
        <div>
          <div className="mb-2 text-[13px] font-semibold text-site-ink">{i("history")}</div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-site-surface px-3 py-2 text-[12px] text-site-ink">
            <span className="tabular-nums">2/10/2026, 13:58</span>
            <span className="rounded-full bg-site-green-bg px-2 py-0.5 font-semibold text-site-green-text">{i("active")}</span>
            <span>{i("players")}</span>
            <span className="ml-auto font-semibold text-site-red">{i("revert")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
