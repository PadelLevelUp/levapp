/**
 * PAD-656 (auth.landing-page): the coaches page's two-phone demo. One absence, one open place, in five
 * steps of STEP_MS: the phone in use glows blue, the other is smaller and dimmed (hidden at <=640px).
 * Autoplay starts when the section enters the screen; it never runs under prefers-reduced-motion; a click
 * on a step stops it. Chat/mock content inside the phones is fictitious and stays literal.
 */
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { Phone } from "../sections/primitives";

export const STEP_MS = 5800;
const LAST = 4;
const STEPS = [0, 1, 2, 3, 4] as const;
/** Which phone is in use at each step: the student's (s), or the coach's (c). */
const ACTIVE: ("c" | "s")[] = ["s", "c", "s", "s", "c"];

const reducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function Row({ name, tag, tone }: { name: string; tag: string; tone: "ok" | "no" | "wait" | "vacant" }) {
  const toneCls = { ok: "text-site-green-text", no: "text-site-faint", wait: "text-site-muted", vacant: "text-site-amber" }[tone];
  return (
    <div className="flex items-center justify-between border-b border-site-border py-2 text-[13px]">
      <span className="font-medium text-site-ink">{name}</span>
      <span className={cn("text-[12px] font-semibold", toneCls)}>{tag}</span>
    </div>
  );
}

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-snug", me ? "ml-auto bg-site-primary text-white" : "bg-site-grey text-site-ink")}>{children}</div>
  );
}

function CoachScreen({ step }: { step: number }) {
  const full = step >= 4;
  const open = step >= 1 && !full;
  const guests: [string, string, "ok" | "no" | "wait"][] =
    step === 1
      ? [["Joana Reis", "Convite enviado", "wait"], ["Tiago Alves", "Convite enviado", "wait"], ["Ana Matos", "Convite enviado", "wait"]]
      : [["Joana Reis", "× Recusou", "no"], ["Tiago Alves", "Sem resposta", "no"], ["Ana Matos", full ? "✓ Aceitou" : "Convite enviado", full ? "ok" : "wait"]];
  return (
    <div className="p-4">
      <div className="text-[15px] font-bold text-site-ink">Bernardo T.</div>
      <div className="text-[12px] text-site-muted">Treinador</div>
      <div className="mt-3 rounded-xl bg-site-wash p-3 text-[12.5px] text-site-ink">
        <div className="font-semibold">Aula Nível 3</div>
        <div className="text-site-muted">Hoje · 18:00 – 19:30 · Campo 2</div>
      </div>
      <div className="mt-3 flex items-baseline justify-between text-[12px] font-semibold text-site-muted">
        <span>Participantes</span>
        <span className="text-site-ink">{open ? "3/4" : "4/4"}</span>
      </div>
      <Row name="Pedro" tag={step >= 1 ? "Faltou" : "Vai"} tone={step >= 1 ? "no" : "ok"} />
      {full && <Row name="Ana Matos" tag="Vai" tone="ok" />}
      {open && <Row name="Lugar vago" tag="Aberto" tone="vacant" />}
      {open && (
        <div className="mt-3 text-[12px] text-site-muted">
          Convites enviados a quem está disponível às 18:00
          {guests.map(([n, tag, tone]) => <Row key={n} name={n} tag={tag} tone={tone} />)}
        </div>
      )}
      {full && <div className="mt-4 rounded-xl bg-site-green-bg p-3 text-center text-[13px] font-semibold text-site-green-text">✓ Aula completa · 4/4</div>}
    </div>
  );
}

function StudentScreen({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="p-4">
        <div className="text-[15px] font-bold text-site-ink">Pedro</div>
        <div className="text-[12px] text-site-muted">Aluno · vai faltar</div>
        <div className="mt-3 rounded-xl bg-site-wash p-3 text-[12.5px] text-site-ink">
          <div className="font-semibold">Aula de hoje · Aula Nível 3</div>
          <div className="text-site-muted">Hoje · 18:00–19:30 · Campo 2</div>
          <div className="text-site-muted">Treinador: Bernardo T. · 4/4</div>
        </div>
        <div className="mt-4 text-[13px] font-medium text-site-ink">Vais a esta aula?</div>
        <div className="mt-2 flex gap-2 text-[13px] font-semibold">
          <span className="flex-1 rounded-lg bg-site-grey py-2 text-center">Vou</span>
          <span className="flex-1 rounded-lg bg-site-primary py-2 text-center text-white">Não vou</span>
        </div>
      </div>
    );
  }
  if (step <= 2) {
    return (
      <div className="relative space-y-2 p-4">
        <div className="text-[15px] font-bold text-site-ink">Ana</div>
        <div className="text-[12px] text-site-muted">Aluna · à procura de vaga</div>
        <div className="pt-1 text-[12px] font-semibold text-site-muted">Clube Padel Norte · Receção</div>
        <Bubble me>Olá! Sabem se há vaga em alguma turma de nível 3 hoje à tarde?</Bubble>
        <Bubble>Olá Ana! Vou perguntar aos treinadores e depois digo-te.</Bubble>
        <Bubble me>Ok, obrigada! Qualquer coisa às 18h dava-me jeito</Bubble>
        <div className="text-right text-[11px] text-site-faint">Entregue · sem resposta</div>
        {step === 2 && (
          <div className="absolute inset-x-3 top-1 rounded-2xl border border-site-border bg-white p-3 text-[12px] shadow-lg">
            <div className="font-semibold text-site-ink">LevApp · Nova mensagem · agora</div>
            <div className="text-site-muted">Olá Ana, abriu uma vaga hoje às 18:00. Queres vir?</div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2 p-4">
      <div className="text-[15px] font-bold text-site-ink">← Bernardo T.</div>
      <div className="text-[12px] text-site-muted">Treinador</div>
      <Bubble>Olá Ana, abriu uma vaga hoje às 18:00. Queres vir?</Bubble>
      {step === 3 ? (
        <div className="flex gap-2 pt-1 text-[13px] font-semibold">
          <span className="flex-1 rounded-lg bg-site-primary py-2 text-center text-white">Sim</span>
          <span className="flex-1 rounded-lg bg-site-grey py-2 text-center">Não</span>
        </div>
      ) : (
        <>
          <Bubble me>✓ Aceite</Bubble>
          <Bubble>Top! Contamos contigo. Até já!</Bubble>
        </>
      )}
    </div>
  );
}

export function TwoPhoneDemo() {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useRef(reducedMotion()).current;
  const stopped = useRef(false); // the user took over: the section entering the screen must not start it
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (reduced || typeof IntersectionObserver === "undefined" || !rootRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (!stopped.current) setPlaying(true);
      },
      { threshold: 0.35 },
    );
    io.observe(rootRef.current);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (!playing || reduced) return;
    const id = setTimeout(() => {
      if (step >= LAST) setPlaying(false);
      else setStep(step + 1);
    }, STEP_MS);
    return () => clearTimeout(id);
  }, [playing, step, reduced]);

  const pick = useCallback((n: number) => {
    stopped.current = true;
    setPlaying(false);
    setStep(n);
  }, []);

  const finished = step === LAST && !playing;
  const onToggle = () => {
    stopped.current = true;
    if (playing) return setPlaying(false);
    if (finished) setStep(0);
    // Reduced motion: no timers, so "play" moves one step per press instead.
    else if (reduced) setStep(step + 1);
    if (!reduced) setPlaying(true);
  };
  const label = playing ? t("site.coaches.demo.pause") : finished ? t("site.coaches.demo.replay") : t("site.coaches.demo.play");
  const Icon = playing ? Pause : finished ? RotateCcw : Play;
  const active = ACTIVE[step];

  const phone = (who: "c" | "s") => (
    <div
      className={cn(
        "flex flex-col items-center gap-3 transition-all duration-500",
        active === who ? "scale-100 opacity-100" : "scale-95 opacity-50 saturate-50 max-[640px]:hidden",
      )}
      data-testid={`site-demo-phone-${who === "c" ? "coach" : "student"}`}
      data-active={active === who}
    >
      <span className="text-[11px] font-bold uppercase tracking-wider text-site-muted">
        {t(who === "c" ? "site.coaches.demo.coachPhone" : "site.coaches.demo.studentPhone")}
      </span>
      <Phone className={cn("transition-shadow duration-500", active === who && "ring-4 ring-site-primary/40 shadow-[0_0_48px_rgba(40,84,212,0.35)]")}>
        {who === "c" ? <CoachScreen step={step} /> : <StudentScreen step={step} />}
      </Phone>
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-testid="site-demo-two-phones"
      data-step={step}
      className="grid items-center gap-10 rounded-[28px] border border-site-border bg-white p-9 shadow-[0_24px_48px_-32px_rgba(13,27,49,0.28)] min-[900px]:grid-cols-[minmax(0,1fr)_auto] max-[640px]:p-5"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-site-primary">{t("site.coaches.demo.eyebrow")}</p>
        <h3 className="mt-2 text-3xl font-bold leading-tight text-site-ink">
          {t("site.coaches.demo.title1")} <span className="text-site-primary">{t("site.coaches.demo.title2")}</span>
        </h3>
        <div aria-live="polite" data-testid="site-demo-scene" className="mt-6 rounded-2xl bg-site-surface p-5">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-site-muted">{t(`site.coaches.demo.scenes.${step}.who`)}</div>
          <div className="mt-1 text-xl font-bold text-site-ink">{t(`site.coaches.demo.scenes.${step}.title`)}</div>
          <p className="mt-2 text-[15px] leading-relaxed text-site-muted">{t(`site.coaches.demo.scenes.${step}.body`)}</p>
        </div>
        <div className="mt-6 grid grid-cols-5 gap-2">
          {STEPS.map((n) => (
            <button
              key={n}
              type="button"
              data-testid={`site-demo-step-${n}`}
              aria-pressed={step === n}
              onClick={() => pick(n)}
              className="text-left text-[12px] font-semibold text-site-muted aria-pressed:text-site-primary max-[640px]:text-[10px]"
            >
              <span className={cn("mb-2 block h-1 rounded-full", n <= step ? "bg-site-primary" : "bg-site-border-strong")} />
              {t(`site.coaches.demo.steps.${n}`)}
            </button>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] font-medium text-site-ink">{t("site.coaches.demo.caption")}</p>
          <button
            type="button"
            data-testid="site-demo-toggle"
            onClick={onToggle}
            className="inline-flex items-center gap-2 rounded-full border border-site-border-strong px-4 py-2 text-[13px] font-semibold text-site-ink hover:bg-site-surface"
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        </div>
      </div>
      <div className="flex items-start justify-center gap-6">
        {phone("c")}
        {phone("s")}
      </div>
    </div>
  );
}
