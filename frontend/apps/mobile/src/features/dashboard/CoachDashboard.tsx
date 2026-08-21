/**
 * The coach dashboard on iOS.
 *
 * Renders the SAME five blocks as the web dashboard, from the same payload and
 * the same shared formatters (`@levelup/config`), so the two can never diverge
 * in what they show — only in arrangement and density. Where web has a desktop
 * two-column split, mobile is a single priority-ordered stack:
 *
 *   hero → needs-you → next 7 days → this week
 *
 * The greeting and date live in the navy app bar (see app/(tabs)/_layout.tsx),
 * which is why there is no in-screen title here.
 */
import { greetingKey, longDate, shortDate, todayISO, weekdayLong, weekdayShort } from "@levelup/config";
import type {
  DashboardBlock,
  DashboardNeedsYouBlock,
  DashboardNeedsYouEmptySeats,
  DashboardNeedsYouItem,
  DashboardNeedsYouReply,
  DashboardNeedsYouValidation,
  DashboardNextClassBlock,
  DashboardSchedule7dBlock,
  DashboardWeekPulseBlock,
} from "@levelup/types";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/** Web hrefs mapped onto mobile routes. Anything without a screen stays put
 * rather than dumping the coach on a 404. */
function go(href: string) {
  if (href.startsWith("/calendar")) router.push("/(tabs)/calendar");
  else if (href.startsWith("/messages")) router.push("/(tabs)/messages");
  else if (href.startsWith("/players")) router.push("/(tabs)/players");
}

/* ── primitives ──────────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Text className="px-1 text-xs font-sans-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </Text>
  );
}

/** Amber only when the class still has holes — see the web FillBar. */
function FillBar({ filled, capacity }: { filled: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, (filled / capacity) * 100) : 0;
  const short = capacity > 0 && filled < capacity;
  return (
    <View className={cn("h-1.5 w-11 overflow-hidden rounded-full", short ? "bg-warning/25" : "bg-muted")}>
      <View
        className={cn("h-full rounded-full", short ? "bg-warning" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

function FillCount({ filled, capacity }: { filled: number; capacity: number }) {
  const short = capacity > 0 && filled < capacity;
  return (
    <Text className={cn("text-xs font-sans-bold", short ? "text-warning-strong" : "text-muted-foreground")}>
      {filled}/{capacity}
    </Text>
  );
}

function StatusBadge({ tone, label }: { tone: "attention" | "done"; label: string }) {
  return (
    <View className={cn("rounded-full px-2.5 py-1", tone === "attention" ? "bg-warning/15" : "bg-success/15")}>
      <Text
        className={cn(
          "text-[11px] font-sans-semibold",
          tone === "attention" ? "text-warning-strong" : "text-success-strong",
        )}
      >
        {label}
      </Text>
    </View>
  );
}

/** `onNavy` matches the ring to the hero's navy surface, which stays navy in
 * both themes. */
function AvatarStack({
  people,
  total,
  onNavy,
}: {
  people: Array<{ id: number; initials: string }>;
  total: number;
  onNavy?: boolean;
}) {
  const overflow = Math.max(0, total - people.length);
  return (
    <View className="flex-row items-center">
      {people.map((p, i) => (
        <View
          key={p.id}
          className={cn(
            "h-7 w-7 items-center justify-center rounded-full border-2",
            onNavy ? "border-sidebar" : "border-card",
            i % 2 === 0 ? "bg-primary" : "bg-info",
            i > 0 && "-ml-2",
          )}
        >
          <Text className="text-[10px] font-sans-bold text-primary-foreground">{p.initials}</Text>
        </View>
      ))}
      {overflow > 0 && (
        <View
          className={cn(
            "-ml-2 h-7 w-7 items-center justify-center rounded-full border-2",
            onNavy ? "border-sidebar bg-sidebar-accent" : "border-card bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-[10px] font-sans-bold",
              onNavy ? "text-sidebar-accent-foreground" : "text-muted-foreground",
            )}
          >
            +{overflow}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Border, never shadow — this is a card in a list. */
function ActionCard({
  accent,
  onPress,
  children,
  testID,
}: {
  accent?: "attention" | "accent";
  onPress?: () => void;
  children: React.ReactNode;
  testID?: string;
}) {
  const body = (
    <View
      className={cn(
        "rounded-2xl border border-border bg-card p-4",
        accent === "attention" && "border-l-4 border-l-warning",
        accent === "accent" && "border-l-4 border-l-primary",
      )}
    >
      {children}
    </View>
  );

  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" testID={testID}>
      {body}
    </Pressable>
  );
}

/* ── blocks ──────────────────────────────────────────────────────────────── */

function NextClassHero({ block }: { block: DashboardNextClassBlock }) {
  const { t, i18n } = useTranslation();
  const d = block.data;

  return (
    // The hero keeps its navy surface in BOTH themes, so every colour here
    // comes from the `sidebar` family. Using card/foreground would invert in
    // dark mode and make the text unreadable.
    <View className="rounded-2xl bg-sidebar p-5" testID="dashboard-next-class">
      <View className="flex-row items-center justify-between">
        <Text className="text-[11px] font-sans-semibold uppercase tracking-widest text-sidebar-foreground/70">
          {d.isToday
            ? t("dashboard.hero.upNext", { time: d.startTime })
            : t("dashboard.hero.nextClass", { weekday: weekdayLong(d.date, i18n.language) })}
        </Text>
        {d.minutesUntil !== null && (
          <View className="rounded-full bg-sidebar-primary/20 px-2.5 py-1">
            <Text className="text-[11px] font-sans-semibold text-sidebar-primary">
              {t("dashboard.hero.startsIn", { minutes: d.minutesUntil })}
            </Text>
          </View>
        )}
      </View>

      <View className="mt-4 gap-1">
        <Text className="font-display text-2xl text-sidebar-foreground">{d.title}</Text>
        <Text className="text-[13px] text-sidebar-foreground/70">
          {d.startTime} – {d.endTime}
        </Text>
      </View>

      <View className="mt-4 flex-row items-center gap-3">
        <AvatarStack people={d.players} total={d.filled} onNavy />
        <Text className="text-[13px] text-sidebar-foreground/70">
          {d.filled}/{d.capacity}
        </Text>
        <View className="flex-1" />
        <Button className="bg-sidebar-primary" onPress={() => go(d.href)}>
          <Text className="font-sans-semibold text-sidebar-primary-foreground">
            {t("dashboard.hero.open")}
          </Text>
        </Button>
      </View>
    </View>
  );
}

function NeedsYouQueue({ block }: { block: DashboardNeedsYouBlock }) {
  const { t } = useTranslation();
  const { items, count } = block.data;

  return (
    <View className="gap-2.5" testID="dashboard-needs-you">
      <Eyebrow>{t("dashboard.needsYou.eyebrow", { count })}</Eyebrow>
      {items.length === 0 ? (
        // One quiet sunken row, no illustration.
        <View className="rounded-2xl bg-muted px-4 py-5">
          <Text className="text-center text-sm text-muted-foreground">
            {t("dashboard.needsYou.empty")}
          </Text>
        </View>
      ) : (
        items.map((item) => <QueueItem key={item.id} item={item} />)
      )}
    </View>
  );
}

function QueueItem({ item }: { item: DashboardNeedsYouItem }) {
  const { t, i18n } = useTranslation();

  if (item.kind === "empty_seats") {
    const it = item as DashboardNeedsYouEmptySeats;
    return (
      <ActionCard accent="attention">
        <View className="gap-0.5">
          <Text className="text-[15px] font-sans-bold text-foreground">
            {t("dashboard.needsYou.emptySeats.title", {
              class: it.classTitle,
              count: it.seatsMissing,
            })}
          </Text>
          <Text className="text-[13px] text-muted-foreground">
            {t("dashboard.needsYou.emptySeats.detail", {
              date: shortDate(it.date, i18n.language),
              time: it.timeLabel,
              filled: it.filled,
              capacity: it.capacity,
            })}
          </Text>
        </View>
        <View className="mt-3.5 flex-row gap-2">
          <Button className="flex-1" onPress={() => go(it.href)}>
            <Text className="font-sans-semibold text-primary-foreground">
              {t("dashboard.needsYou.emptySeats.invite", { count: it.seatsMissing })}
            </Text>
          </Button>
          <Button variant="outline">
            <Text className="font-sans-semibold text-foreground">
              {t("dashboard.needsYou.later")}
            </Text>
          </Button>
        </View>
      </ActionCard>
    );
  }

  if (item.kind === "reply") {
    const it = item as DashboardNeedsYouReply;
    return (
      // No buttons on mobile by design — the whole card opens the thread, which
      // makes the touch target the card itself.
      <ActionCard accent="accent" onPress={() => go(it.href)}>
        <View className="flex-row items-center gap-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
            <Text className="text-xs font-sans-bold text-secondary-foreground">{it.initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-sans-bold text-foreground">
              {t("dashboard.needsYou.reply.title", { name: it.personName })}
            </Text>
            <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
              {it.preview}
            </Text>
          </View>
        </View>
      </ActionCard>
    );
  }

  const it = item as DashboardNeedsYouValidation;
  return (
    // No accent — validation is a chore, not a problem.
    <ActionCard>
      <View className="flex-row items-center gap-3.5">
        <View className="flex-1">
          <Text className="text-[15px] font-sans-bold text-foreground">
            {t("dashboard.needsYou.validation.title", { count: it.count })}
          </Text>
          <Text className="text-[13px] text-muted-foreground">
            {t("dashboard.needsYou.validation.detail", { count: it.classCount })}
          </Text>
        </View>
        <Button variant="secondary" onPress={() => go(it.href)}>
          <Text className="font-sans-semibold text-secondary-foreground">
            {t("dashboard.needsYou.validation.review")}
          </Text>
        </Button>
      </View>
    </ActionCard>
  );
}

function Schedule7Days({ block }: { block: DashboardSchedule7dBlock }) {
  const { t, i18n } = useTranslation();
  const { items, totalCount, calendarHref } = block.data;

  return (
    <View className="gap-2.5" testID="dashboard-schedule">
      <View className="flex-row items-center justify-between">
        <Eyebrow>{t("dashboard.schedule.eyebrow", { count: totalCount })}</Eyebrow>
        <Pressable onPress={() => go(calendarHref)} accessibilityRole="button" className="px-1 py-2">
          <Text className="text-[13px] font-sans-semibold text-primary">
            {t("dashboard.schedule.calendar")}
          </Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View className="rounded-2xl bg-muted px-4 py-5">
          <Text className="text-center text-sm text-muted-foreground">
            {t("dashboard.schedule.none")}
          </Text>
        </View>
      ) : (
        // 1px gaps: the group background shows through as the separators, so
        // rows never double up borders. NOTE: no coloured left bar — a uniform
        // accent on every row carries no information.
        <View className="gap-px overflow-hidden rounded-2xl border border-border bg-border">
          {items.map((row) => {
            const full = row.capacity > 0 && row.filled >= row.capacity;
            return (
              <Pressable
                key={row.id}
                onPress={() => go(row.href)}
                accessibilityRole="button"
                className="flex-row items-center gap-3.5 bg-card px-4 py-3.5"
              >
                <View className="w-10 items-center">
                  <Text className="text-[11px] text-muted-foreground">
                    {weekdayShort(row.date, i18n.language)}
                  </Text>
                  <Text className="text-[15px] font-sans-bold text-foreground">{row.dayOfMonth}</Text>
                </View>
                <View className="flex-1 gap-1.5">
                  <Text numberOfLines={1} className="text-[15px] font-sans-bold text-foreground">
                    {row.title}
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-muted-foreground">{row.timeLabel}</Text>
                    <FillBar filled={row.filled} capacity={row.capacity} />
                    <FillCount filled={row.filled} capacity={row.capacity} />
                  </View>
                </View>
                {row.capacity > 0 &&
                  (full ? (
                    <StatusBadge tone="done" label={t("dashboard.schedule.full")} />
                  ) : row.filled === 0 ? (
                    <StatusBadge tone="attention" label={t("dashboard.schedule.empty")} />
                  ) : (
                    <StatusBadge
                      tone="attention"
                      label={t("dashboard.schedule.seats", { count: row.capacity - row.filled })}
                    />
                  ))}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function WeekPulse({ block }: { block: DashboardWeekPulseBlock }) {
  const { t } = useTranslation();
  const { seatsFilled, players } = block.data;

  return (
    <View className="gap-2.5" testID="dashboard-week-pulse">
      <Eyebrow>{t("dashboard.pulse.eyebrow")}</Eyebrow>
      {/* Two compact cards side by side. No charts on mobile — seven bars at
          this width read as decoration. */}
      <View className="flex-row gap-2.5">
        <Stat
          label={t("dashboard.pulse.seatsFilled")}
          value={`${seatsFilled.pct}%`}
          sub={t("dashboard.pulse.seatsFilledSub", {
            filled: seatsFilled.filled,
            total: seatsFilled.total,
          })}
        />
        <Stat
          label={t("dashboard.pulse.activePlayers")}
          value={String(players.active)}
          sub={t("dashboard.pulse.activePlayersSub", {
            total: players.total,
            idle: players.idle,
          })}
        />
      </View>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View className="flex-1 gap-1.5 rounded-2xl border border-border bg-card p-4">
      <Text className="text-[13px] font-sans-semibold text-muted-foreground">{label}</Text>
      <Text className="font-display text-2xl text-foreground">{value}</Text>
      <Text className="text-[11px] text-muted-foreground">{sub}</Text>
    </View>
  );
}

/* ── screen ──────────────────────────────────────────────────────────────── */

function pick<T extends DashboardBlock["type"]>(blocks: DashboardBlock[], type: T) {
  return blocks.find((b): b is Extract<DashboardBlock, { type: T }> => b.type === type);
}

/** True when the payload is the rebuilt coach dashboard rather than the
 * player one, which still ships the older blocks. */
export function isCoachDashboard(blocks: DashboardBlock[]): boolean {
  return blocks.some(
    (b) => b.type === "needs_you" || b.type === "next_class" || b.type === "week_pulse",
  );
}

export function CoachDashboard({ blocks }: { blocks: DashboardBlock[] }) {
  const hero = pick(blocks, "next_class");
  const needsYou = pick(blocks, "needs_you");
  const schedule = pick(blocks, "schedule_7d");
  const pulse = pick(blocks, "week_pulse");

  return (
    <View className="gap-5" testID="coach-dashboard">
      {hero && <NextClassHero block={hero} />}
      {needsYou && <NeedsYouQueue block={needsYou} />}
      {schedule && <Schedule7Days block={schedule} />}
      {pulse && <WeekPulse block={pulse} />}
    </View>
  );
}

/** Greeting + date for the navy app bar. Exported so the tab layout can render
 * it in the header rather than the screen repeating a title. */
export function useHeaderGreeting(firstName: string) {
  const { t, i18n } = useTranslation();
  return {
    greeting: t(`dashboard.greeting.${greetingKey()}`, { name: firstName }),
    date: longDate(todayISO(), i18n.language),
  };
}
