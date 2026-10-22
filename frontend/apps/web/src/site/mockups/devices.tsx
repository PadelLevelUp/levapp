/**
 * PAD-656: the device renders the landing and the new site share (moved out of LandingPage so the
 * switch commit only deletes the page). Real App Store screenshots inside real device frames; the
 * strings are still the `landing.*` keys they had.
 */
import { Bell, Check, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

export const MARK_ON_DARK = "/brand/levapp-mark-on-dark.svg";
export const mockShadow = "shadow-[0_24px_48px_-24px_rgba(13,27,49,0.35)]";

/**
 * Real device renders: the screen area is transparent in the frame image, so
 * the screenshot sits underneath and the bezel masks its edges. The insets are
 * where the screen sits inside each frame, as a percentage of the frame.
 */
export const FRAMES = {
  iphone: {
    src: "/landing/iphone-frame.png",
    w: 800,
    h: 1745,
    left: 4.0,
    top: 1.78,
    width: 91.63,
    height: 97.08,
  },
  macbook: {
    src: "/landing/macbook-frame.png",
    w: 1681,
    h: 1137,
    left: 10.11,
    top: 2.02,
    width: 79.89,
    height: 77.4,
  },
  watch: {
    src: "/landing/watch-frame.png",
    w: 316,
    h: 520,
    left: 12.03,
    top: 22.12,
    width: 71.52,
    height: 52.69,
  },
} as const;

export const SCREENS = {
  calendar: "/landing/screen-calendario.png",
  messages: "/landing/screen-mensagens.png",
  presences: "/landing/screen-presencas.png",
  training: "/landing/screen-treino.png",
  mobileDashboard: "/landing/screen-movel-painel.png",
  mobilePresences: "/landing/screen-movel-presencas.png",
  mobileMessages: "/landing/screen-movel-mensagens.png",
  mobilePresencesCoach: "/landing/screen-movel-presencas-treinador.png",
  mobileDashboardCoach: "/landing/screen-movel-painel-treinador.png",
} as const;

/**
 * PAD-656 (auth.landing-page rule 7, the ticket's WebP + srcset): a screenshot or frame served as
 * WebP — a 640 px variant and the full size, chosen by the rendered width — with the PNG as the
 * fallback `<img>` (and the one tests and older browsers see). `priority` is the hero's
 * fetchpriority=high. The watch frame (316 px) has no 640 variant.
 */
export function SiteImage({
  src,
  nativeWidth,
  sizes,
  alt,
  eager,
  priority,
  className,
  width,
  height,
}: {
  src: string;
  nativeWidth: number;
  sizes: string;
  alt: string;
  eager?: boolean;
  priority?: boolean;
  className?: string;
  width?: number;
  height?: number;
}) {
  const base = src.replace(/\.png$/, "");
  const srcSet = nativeWidth > 640 ? `${base}-640.webp 640w, ${base}.webp ${nativeWidth}w` : `${base}.webp ${nativeWidth}w`;
  // React 18 has no fetchPriority prop; the lowercase attribute passes through to the DOM.
  const fetchAttrs = priority ? ({ fetchpriority: "high" } as Record<string, string>) : {};
  return (
    <picture className="contents">
      <source type="image/webp" srcSet={srcSet} sizes={sizes} />
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? "eager" : "lazy"}
        decoding={eager ? "sync" : "async"}
        className={className}
        draggable={false}
        {...fetchAttrs}
      />
    </picture>
  );
}

/** Rendered widths of the frames: the laptop up to ~720 px, phones up to ~320 px, the watch ~160 px. */
const SIZES = {
  macbook: "(max-width: 900px) 92vw, 720px",
  iphone: "(max-width: 640px) 45vw, 320px",
  watch: "160px",
} as const;

/** Native widths of the screenshots (desktop captures 1280 px, phone captures ~890 px). */
const SCREEN_WIDTH = { macbook: 1280, iphone: 890 } as const;

export function DeviceFrame({
  kind,
  className,
  eager,
  priority,
  children,
}: {
  kind: keyof typeof FRAMES;
  className: string;
  eager?: boolean;
  /** The hero's frame and screenshot load first (fetchpriority=high). */
  priority?: boolean;
  children: ReactNode;
}) {
  const f = FRAMES[kind];
  return (
    <div className={className}>
      <div
        className="relative w-full drop-shadow-[0_30px_50px_rgba(15,23,42,0.28)]"
        style={{ aspectRatio: `${f.w} / ${f.h}` }}
      >
        <div
          className="absolute overflow-hidden bg-black"
          style={{
            left: `${f.left}%`,
            top: `${f.top}%`,
            width: `${f.width}%`,
            height: `${f.height}%`,
          }}
        >
          {children}
        </div>
        <SiteImage
          src={f.src}
          nativeWidth={f.w}
          sizes={SIZES[kind]}
          alt=""
          width={f.w}
          height={f.h}
          eager={eager}
          priority={priority}
          className="pointer-events-none relative h-full w-full select-none"
        />
      </div>
    </div>
  );
}

export type ShotProps = {
  src: string;
  alt: string;
  eager?: boolean;
  priority?: boolean;
  className?: string;
};

export function PhoneShot({ src, alt, eager = false, priority, className }: ShotProps) {
  return (
    <DeviceFrame
      kind="iphone"
      className={className ?? "relative mx-auto w-[280px]"}
      eager={eager}
      priority={priority}
    >
      <SiteImage src={src} nativeWidth={SCREEN_WIDTH.iphone} sizes={SIZES.iphone} alt={alt} eager={eager} priority={priority} className="h-full w-full object-cover object-top" />
    </DeviceFrame>
  );
}

export function LaptopShot({ src, alt, eager = false, priority, className }: ShotProps) {
  return (
    <DeviceFrame
      kind="macbook"
      className={className ?? "relative w-full"}
      eager={eager}
      priority={priority}
    >
      <SiteImage src={src} nativeWidth={SCREEN_WIDTH.macbook} sizes={SIZES.macbook} alt={alt} eager={eager} priority={priority} className="h-full w-full object-cover object-left-top" />
    </DeviceFrame>
  );
}

export function WatchShot({
  variant,
  className,
}: {
  variant: "filled" | "invite";
  className?: string;
}) {
  const { t } = useTranslation();
  const isInvite = variant === "invite";
  const text = t(`landing.watch.${variant}.title`);
  const meta = t(`landing.watch.${variant}.meta`);

  return (
    <div role="img" aria-label={t("landing.watch.label", { text })} className="contents">
      <DeviceFrame
        kind="watch"
        className={className ?? "relative mx-auto w-[168px]"}
      >
        <div
          className="flex h-full w-full flex-col bg-black px-[7%] pb-[7%] pt-[9%] text-white"
          style={{ containerType: "inline-size" }}
        >
          <div className="flex items-center justify-between text-[6cqw] font-medium text-white/60">
            <span className="flex items-center gap-[3cqw]">
              <img src={MARK_ON_DARK} alt="" className="h-[7cqw] w-[9cqw]" />
              LevApp
            </span>
            <span>{t("landing.watch.now")}</span>
          </div>
          <div className="mt-[5cqw] flex flex-1 flex-col items-center justify-center rounded-[10cqw] bg-[#15171d] px-[6cqw] py-[5cqw] text-center">
            <span
              className={cn(
                "flex h-[19cqw] w-[19cqw] items-center justify-center rounded-full shadow-[0_0_0_3cqw_rgba(47,138,255,0.25)]",
                isInvite ? "bg-success" : "bg-primary",
              )}
            >
              {isInvite ? (
                <Bell className="h-[11cqw] w-[11cqw] text-white" strokeWidth={3} />
              ) : (
                <Check className="h-[11cqw] w-[11cqw] text-white" strokeWidth={3} />
              )}
            </span>
            <p className="mt-[5cqw] text-[7cqw] font-semibold leading-[1.25] text-white">
              {text}
            </p>
            <p className="mt-[3cqw] text-[5.5cqw] text-white/50">{meta}</p>
          </div>
        </div>
      </DeviceFrame>
    </div>
  );
}

export function CoachHeroMockup() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto w-full max-w-[720px] pb-20 pl-8 pt-6 sm:pl-14">
      <LaptopShot src={SCREENS.calendar} alt={t("landing.alt.calendar")} eager priority />
      <PhoneShot
        src={SCREENS.mobileDashboardCoach}
        alt={t("landing.alt.mobileDashboardCoach")}
        eager
        className="absolute -right-3 bottom-0 hidden w-[140px] sm:block"
      />
      <WatchShot
        variant="filled"
        className="absolute -bottom-6 left-0 hidden w-[130px] sm:block lg:w-[150px]"
      />
    </div>
  );
}

export function PlayerHeroMockup() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto flex w-full max-w-[460px] items-end justify-center gap-6 pb-10 pt-10">
      <WatchShot variant="invite" className="relative mb-10 hidden w-[160px] sm:block" />
      <PhoneShot
        src={SCREENS.mobileDashboard}
        alt={t("landing.alt.mobileDashboard")}
        eager
        className="relative w-[260px]"
      />
    </div>
  );
}

export function OthersMockup() {
  const { t } = useTranslation();
  return (
    <div className={cn("rounded-3xl border border-border bg-muted p-8", mockShadow)}>
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Sparkles className="size-8" />
        </span>
        <p className="mt-6 font-display text-xl font-bold">
          {t("landing.others.mockupTitle")}
        </p>
        <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-muted-foreground">
          {t("landing.others.mockupBody")}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- header --------------------------------- */

