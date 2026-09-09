/**
 * The home blocks both roles share on iOS (PAD-202).
 *
 * Renders the SAME block payload as the web dashboard, from the same shared
 * formatters (`@levelup/config`), so the two shells can never diverge in what
 * they show — only in arrangement and density. `CoachDashboard` and
 * `StudentDashboard` compose these; neither re-decides a rule the blocks
 * already encode:
 *
 * - the hero keeps its navy surface in both themes (`sidebar` tokens);
 * - amber means "needs you", green means "done", nothing else;
 * - a badge appears only when it carries information;
 * - cards in lists use borders, never shadows.
 *
 * Every class-carrying row deep-links into that exact occurrence
 * (dashboard.navigation rule 8): `go()` parses the web href the server sends
 * and opens the class detail screen with the params it needs, the way the
 * calendar does.
 */
import { shortDate, weekdayLong, weekdayShort } from "@levelup/config";
import type {
  DashboardKpiGridBlock,
  DashboardNeedsYouBlock,
  DashboardNeedsYouEmptySeats,
  DashboardNeedsYouInvite,
  DashboardNeedsYouItem,
  DashboardNeedsYouReply,
  DashboardNeedsYouValidation,
  DashboardNeedsYouVacancyInvite,
  DashboardNeedsYouWaitingListOffer,
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
import { toast } from "@/components/ui/toast";
import { useSnoozeNeedsYouItem } from "@levelup/hooks";
import {
  useRespondInvite,
  useRespondReminder,
  useRespondWaitingListOffer,
} from "@/features/calendar/hooks";
import { parseDashboardItemId } from "@/features/calendar/params";
import { cn } from "@/lib/utils";

/**
 * Web hrefs mapped onto mobile routes. A calendar deep link
 * (`/calendar?classId=…&date=…`) opens that class's detail screen, exactly
 * as tapping it on the calendar would; a bare `/calendar` opens the tab.
 * Anything without a screen stays put rather than dumping the user on a 404 —
 * `canGo` is the switch, so a tile can render inert instead of dead.
 */
export function canGo(href: string | undefined): href is string {
  if (!href) return false;
  return ["/calendar", "/messages", "/players", "/attendance", "/absences"].some((p) =>
    href.startsWith(p),
  );
}

export function go(href: string, hint?: { title?: string; timeLabel?: string }) {
  if (href.startsWith("/calendar")) {
    const query = href.split("?")[1] ?? "";
    const params = new URLSearchParams(query);
    const classId = params.get("classId") ?? "";
    const parsed = classId ? parseDashboardItemId(classId) : null;
    if (parsed) {
      router.push({
        pathname: "/class/[id]",
        params: {
          id: classId,
          model: parsed.model,
          originalId: String(parsed.originalId),
          date: params.get("date") ?? parsed.date,
          startTime: hint?.timeLabel ?? "",
          title: hint?.title ?? "",
          isRecurring: parsed.date ? "1" : "0",
        },
      });
      return;
    }
    router.push("/(tabs)/calendar");
  } else if (href.startsWith("/messages")) router.push("/(tabs)/messages");
  else if (href.startsWith("/players")) router.push("/(tabs)/players");
  // PAD-162: the student's "Attended" KPI.
  else if (href.startsWith("/attendance")) router.push("/attendance" as never);
  // PAD-163: the student's "Missed" KPI, same backend contract
  // (helpers/dashboard/player.py emits `/absences` for both shells).
  else if (href.startsWith("/absences")) router.push("/absences" as never);
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
function FillBar({
  filled,
  capacity,
  neutral,
}: {
  filled: number;
  capacity: number;
  /** PAD-202: a student's rows never go amber — seats are the coach's problem. */
  neutral?: boolean;
}) {
  const pct = capacity > 0 ? Math.min(100, (filled / capacity) * 100) : 0;
  const short = !neutral && capacity > 0 && filled < capacity;
  return (
    <View className={cn("h-1.5 w-11 overflow-hidden rounded-full", short ? "bg-warning/25" : "bg-muted")}>
      <View
        className={cn("h-full rounded-full", short ? "bg-warning" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

function FillCount({
  filled,
  capacity,
  neutral,
}: {
  filled: number;
  capacity: number;
  neutral?: boolean;
}) {
  const short = !neutral && capacity > 0 && filled < capacity;
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

/**
 * Yes / No for a class the student was asked to confirm (PAD-202 correction,
 * dashboard.blocks rule 3a). Same endpoint as the chat's reminder message; the
 * hook's onSuccess invalidates the dashboard (so the buttons disappear because
 * the payload says so) and the unread-count badge (rule 13).
 */
function AnswerButtons({
  lessonInstanceId,
  onNavy,
}: {
  lessonInstanceId: number;
  onNavy?: boolean;
}) {
  const { t } = useTranslation();
  const respond = useRespondReminder();
  const busy = respond.isPending;
  const answer = (action: "yes" | "no") =>
    respond.mutate(
      { lessonInstanceId, action },
      {
        onSuccess: (result) => {
          if (result.action === "expired") toast.error(t("dashboard.answer.expired"));
          else toast.success(t(result.action === "confirmed" ? "dashboard.answer.confirmed" : "dashboard.answer.declined"));
        },
        onError: () => toast.error(t("dashboard.answer.failed")),
      },
    );
  return (
    <View className="flex-row items-center gap-2" testID="dashboard-confirm">
      <Button
        size="sm"
        disabled={busy}
        testID="dashboard-confirm-yes"
        className={cn(onNavy && "bg-sidebar-primary")}
        onPress={() => answer("yes")}
      >
        <Text className={cn("font-sans-semibold", onNavy ? "text-sidebar-primary-foreground" : "text-primary-foreground")}>
          {t("dashboard.answer.yes")}
        </Text>
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        testID="dashboard-confirm-no"
        className={cn(onNavy && "border-sidebar-foreground/30 bg-transparent")}
        onPress={() => answer("no")}
      >
        <Text className={cn("font-sans-semibold", onNavy ? "text-sidebar-foreground" : "text-foreground")}>
          {t("dashboard.answer.no")}
        </Text>
      </Button>
    </View>
  );
}

/**
 * PAD-236: Yes / No for the two chat-born asks. Same endpoints the bubble
 * calls; the card leaves when the refetched payload no longer lists it.
 */
function AskButtons({
  busy,
  onAnswer,
}: {
  busy: boolean;
  onAnswer: (action: "yes" | "no") => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center gap-2" testID="dashboard-confirm">
      <Button size="sm" disabled={busy} testID="dashboard-confirm-yes" onPress={() => onAnswer("yes")}>
        <Text className="font-sans-semibold text-primary-foreground">{t("dashboard.answer.yes")}</Text>
      </Button>
      <Button size="sm" variant="outline" disabled={busy} testID="dashboard-confirm-no" onPress={() => onAnswer("no")}>
        <Text className="font-sans-semibold text-foreground">{t("dashboard.answer.no")}</Text>
      </Button>
    </View>
  );
}

function VacancyInviteCard({ item }: { item: DashboardNeedsYouVacancyInvite }) {
  const { t, i18n } = useTranslation();
  const respond = useRespondInvite();
  const answer = (action: "yes" | "no") =>
    respond.mutate(
      { notificationEventId: item.notificationEventId, action },
      {
        onSuccess: (result) => {
          if (result.action === "confirmed") toast.success(t("dashboard.answer.confirmed"));
          else if (result.action === "declined") toast.success(t("dashboard.answer.inviteDeclined"));
          else if (result.action === "expired") toast.error(t("dashboard.answer.expired"));
          // No toast.info on mobile: "just filled" is bad news, so error.
          else if (String(result.action).startsWith("spot_filled")) toast.error(t("dashboard.answer.spotFilled"));
          else toast.error(t("dashboard.answer.failed"));
        },
        onError: () => toast.error(t("dashboard.answer.failed")),
      },
    );
  return (
    <ActionCard accent="attention" testID="dashboard-queue-vacancy-invite">
      <View className="gap-0.5">
        <Text className="text-[15px] font-sans-bold text-foreground">
          {t("dashboard.needsYou.vacancyInvite.title", { class: item.classTitle })}
        </Text>
        <Text className="text-[13px] text-muted-foreground">
          {t("dashboard.needsYou.vacancyInvite.detail", {
            date: shortDate(item.date, i18n.language),
            time: item.timeLabel,
            filled: item.filled,
            capacity: item.capacity,
          })}
        </Text>
      </View>
      <View className="mt-3.5 flex-row items-center gap-2">
        <AskButtons busy={respond.isPending} onAnswer={answer} />
        <View className="flex-1" />
        <Pressable
          onPress={() => go(item.href, { title: item.classTitle, timeLabel: item.timeLabel })}
          accessibilityRole="button"
          className="px-2 py-2"
        >
          <Text className="text-[13px] font-sans-semibold text-primary">
            {t("dashboard.needsYou.vacancyInvite.open")}
          </Text>
        </Pressable>
      </View>
    </ActionCard>
  );
}

function WaitingListOfferCard({ item }: { item: DashboardNeedsYouWaitingListOffer }) {
  const { t, i18n } = useTranslation();
  const respond = useRespondWaitingListOffer();
  const answer = (action: "yes" | "no") =>
    respond.mutate(
      { lessonInstanceId: item.lessonInstanceId, action },
      {
        onSuccess: (result) => {
          if (result.action === "added_to_waiting_list") toast.success(t("dashboard.answer.joinedWaitingList"));
          else if (result.action === "declined") toast.success(t("dashboard.answer.offerDeclined"));
          else if (result.action === "expired") toast.error(t("dashboard.answer.expired"));
          else toast.error(t("dashboard.answer.failed"));
        },
        onError: () => toast.error(t("dashboard.answer.failed")),
      },
    );
  return (
    <ActionCard accent="attention" testID="dashboard-queue-waiting-list-offer">
      <View className="gap-0.5">
        <Text className="text-[15px] font-sans-bold text-foreground">
          {t("dashboard.needsYou.waitingListOffer.title", { class: item.classTitle })}
        </Text>
        <Text className="text-[13px] text-muted-foreground">
          {t("dashboard.needsYou.waitingListOffer.detail", {
            date: shortDate(item.date, i18n.language),
            time: item.timeLabel,
          })}
        </Text>
      </View>
      <View className="mt-3.5 flex-row items-center gap-2">
        <AskButtons busy={respond.isPending} onAnswer={answer} />
        <View className="flex-1" />
        <Pressable
          onPress={() => go(item.href, { title: item.classTitle, timeLabel: item.timeLabel })}
          accessibilityRole="button"
          className="px-2 py-2"
        >
          <Text className="text-[13px] font-sans-semibold text-primary">
            {t("dashboard.needsYou.waitingListOffer.open")}
          </Text>
        </Pressable>
      </View>
    </ActionCard>
  );
}

/* ── blocks ──────────────────────────────────────────────────────────────── */

export function NextClassHero({ block }: { block: DashboardNextClassBlock }) {
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

      {d.pendingConfirmation === true && typeof d.lessonInstanceId === "number" && (
        <View className="mt-4 flex-row items-center gap-3">
          <Text className="text-[13px] font-sans-semibold text-sidebar-foreground/90">
            {t("dashboard.schedule.toConfirm")}
          </Text>
          <AnswerButtons lessonInstanceId={d.lessonInstanceId} onNavy />
        </View>
      )}

      <View className="mt-4 flex-row items-center gap-3">
        <AvatarStack people={d.players} total={d.filled} onNavy />
        <Text className="text-[13px] text-sidebar-foreground/70">
          {d.filled}/{d.capacity}
        </Text>
        <View className="flex-1" />
        <Button className="bg-sidebar-primary" onPress={() => go(d.href, { title: d.title, timeLabel: d.startTime })}>
          <Text className="font-sans-semibold text-sidebar-primary-foreground">
            {t("dashboard.hero.open")}
          </Text>
        </Button>
      </View>
    </View>
  );
}

export function NeedsYouQueue({ block }: { block: DashboardNeedsYouBlock }) {
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

/**
 * "Later" (dashboard.blocks rule 3c): the server hides this occurrence for 24
 * hours on every device; the card goes when the invalidated dashboard query
 * refetches and the payload no longer carries it.
 */
function EmptySeatsCard({ item: it }: { item: DashboardNeedsYouEmptySeats }) {
  const { t, i18n } = useTranslation();
  const snooze = useSnoozeNeedsYouItem();
  const later = () =>
    snooze.mutate(it.id, {
      onError: () => toast.error(t("dashboard.needsYou.laterFailed")),
    });

  return (
    <ActionCard accent="attention" testID={`needs-you-empty-seats-${it.id}`}>
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
        <Button className="flex-1" onPress={() => go(it.href, { title: it.classTitle, timeLabel: it.timeLabel })}>
          <Text className="font-sans-semibold text-primary-foreground">
            {t("dashboard.needsYou.emptySeats.invite", { count: it.seatsMissing })}
          </Text>
        </Button>
        <Button variant="outline" disabled={snooze.isPending} onPress={later} testID="needs-you-later">
          <Text className="font-sans-semibold text-foreground">
            {t("dashboard.needsYou.later")}
          </Text>
        </Button>
      </View>
    </ActionCard>
  );
}

function QueueItem({ item }: { item: DashboardNeedsYouItem }) {
  const { t, i18n } = useTranslation();

  if (item.kind === "empty_seats") {
    const it = item as DashboardNeedsYouEmptySeats;
    return <EmptySeatsCard item={it} />;
  }

  if (item.kind === "invite") {
    // PAD-202: the student's counterpart of the empty-seats card. Amber
    // because it is the student's to resolve; "Open" lands on the class with
    // confirm / decline in view.
    const it = item as DashboardNeedsYouInvite;
    return (
      <ActionCard accent="attention" testID="dashboard-queue-invite">
        <View className="gap-0.5">
          <Text className="text-[15px] font-sans-bold text-foreground">
            {t("dashboard.needsYou.invite.title", { class: it.classTitle })}
          </Text>
          <Text className="text-[13px] text-muted-foreground">
            {t("dashboard.needsYou.invite.detail", {
              date: shortDate(it.date, i18n.language),
              time: it.timeLabel,
              filled: it.filled,
              capacity: it.capacity,
            })}
          </Text>
        </View>
        <View className="mt-3.5 flex-row items-center gap-2">
          <AnswerButtons lessonInstanceId={it.lessonInstanceId} />
          <View className="flex-1" />
          <Pressable
            onPress={() => go(it.href, { title: it.classTitle, timeLabel: it.timeLabel })}
            accessibilityRole="button"
            className="px-2 py-2"
          >
            <Text className="text-[13px] font-sans-semibold text-primary">
              {t("dashboard.needsYou.invite.open")}
            </Text>
          </Pressable>
        </View>
      </ActionCard>
    );
  }

  if (item.kind === "vacancy_invite") {
    return <VacancyInviteCard item={item as DashboardNeedsYouVacancyInvite} />;
  }

  if (item.kind === "waiting_list_offer") {
    return <WaitingListOfferCard item={item as DashboardNeedsYouWaitingListOffer} />;
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

/**
 * `role` (PAD-202): a student's week is the same rows, minus everything that is
 * the coach's job — no capacity badge, and a fill count that never goes amber.
 */
export function Schedule7Days({
  block,
  role = "coach",
}: {
  block: DashboardSchedule7dBlock;
  role?: "coach" | "student";
}) {
  const { t, i18n } = useTranslation();
  const { items, totalCount, calendarHref } = block.data;
  const student = role === "student";

  return (
    <View className="gap-2.5" testID="dashboard-schedule">
      <View className="flex-row items-center justify-between">
        <Eyebrow>
          {t(student ? "dashboard.schedule.eyebrowUpcoming" : "dashboard.schedule.eyebrow", {
            count: totalCount,
          })}
        </Eyebrow>
        <Pressable onPress={() => go(calendarHref)} accessibilityRole="button" className="px-1 py-2">
          <Text className="text-[13px] font-sans-semibold text-primary">
            {t("dashboard.schedule.calendar")}
          </Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View className="rounded-2xl bg-muted px-4 py-5">
          <Text className="text-center text-sm text-muted-foreground">
            {t(student ? "dashboard.schedule.noneUpcoming" : "dashboard.schedule.none")}
          </Text>
        </View>
      ) : (
        // 1px gaps: the group background shows through as the separators, so
        // rows never double up borders. NOTE: no coloured left bar — a uniform
        // accent on every row carries no information.
        <View className="gap-px overflow-hidden rounded-2xl border border-border bg-border">
          {items.map((row) => {
            const full = row.capacity > 0 && row.filled >= row.capacity;
            const pending =
              student && row.pendingConfirmation === true && typeof row.lessonInstanceId === "number";
            return (
              <Pressable
                key={row.id}
                onPress={() => go(row.href, { title: row.title, timeLabel: row.timeLabel })}
                accessibilityRole="button"
                testID="dashboard-schedule-row"
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
                    <FillBar filled={row.filled} capacity={row.capacity} neutral={student} />
                    <FillCount filled={row.filled} capacity={row.capacity} neutral={student} />
                  </View>
                  {/* The student's one job on this row: answer the reminder here. */}
                  {pending && (
                    <View className="mt-1">
                      <AnswerButtons lessonInstanceId={row.lessonInstanceId as number} />
                    </View>
                  )}
                </View>
                {!student &&
                  row.capacity > 0 &&
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

export function WeekPulse({ block }: { block: DashboardWeekPulseBlock }) {
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

export function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View className="flex-1 gap-1.5 rounded-2xl border border-border bg-card p-4">
      <Text className="text-[13px] font-sans-semibold text-muted-foreground">{label}</Text>
      <Text className="font-display text-2xl text-foreground">{value}</Text>
      <Text className="text-[11px] text-muted-foreground">{sub}</Text>
    </View>
  );
}


/* ── student KPIs ────────────────────────────────────────────────────────── */

/** "Upcoming lessons" → "upcoming-lessons" — stable key for dashboard-kpi-<key>. */
export function kpiKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** PAD-77: backend labels are English literals; the slug maps to an i18n key. */
const KPI_LABEL_KEYS: Record<string, string> = {
  attended: "dashboard.kpi.attended",
  missed: "dashboard.kpi.missed",
  "upcoming-lessons": "dashboard.kpi.upcomingLessons",
  invites: "dashboard.kpi.invites",
};

/**
 * The student's four numbers as stat cards — label, number, and the context
 * that makes the number readable (PAD-202). Tile ids, the inert-without-href
 * rule (PAD-76) and the destinations are unchanged.
 */
export function KpiTiles({ block }: { block: DashboardKpiGridBlock }) {
  const { t } = useTranslation();
  const rows: Array<DashboardKpiGridBlock["data"]["items"]> = [];
  block.data.items.forEach((item, i) => {
    if (i % 2 === 0) rows.push([item]);
    else rows[rows.length - 1].push(item);
  });

  return (
    <View className="gap-2.5" testID="dashboard-kpis">
      <Eyebrow>{t("dashboard.kpi.eyebrow")}</Eyebrow>
      {rows.map((row, i) => (
        <View key={i} className="flex-row gap-2.5">
          {row.map((item) => {
            const slug = kpiKey(item.label);
            const labelKey = KPI_LABEL_KEYS[slug];
            const label = labelKey ? t(labelKey) : item.label;
            const sub =
              typeof item.total === "number"
                ? t("dashboard.kpi.ofLessons", { count: item.total })
                : slug === "upcoming-lessons"
                  ? t("dashboard.kpi.next30Days")
                  : slug === "invites"
                    ? t("dashboard.kpi.toConfirm")
                    : "";
            const value = `${item.prefix ?? ""}${item.value}`;
            const card = (
              <View className="flex-1 gap-1.5 rounded-2xl border border-border bg-card p-4">
                <Text className="text-[13px] font-sans-semibold text-muted-foreground">{label}</Text>
                <Text className="font-display text-2xl text-foreground">{value}</Text>
                <Text className="text-[11px] text-muted-foreground">{sub}</Text>
              </View>
            );
            // Label carries the value too: the accessible container hides its
            // child Text nodes from VoiceOver/UI tests otherwise.
            const a11y = `${label}: ${value}`;
            const href = item.href;
            return canGo(href) ? (
              <Pressable
                key={item.label}
                testID={`dashboard-kpi-${slug}`}
                accessibilityLabel={a11y}
                accessibilityRole="button"
                onPress={() => go(href)}
                className="flex-1 active:opacity-80"
              >
                {card}
              </Pressable>
            ) : (
              <View key={item.label} testID={`dashboard-kpi-${slug}`} accessibilityLabel={a11y} className="flex-1">
                {card}
              </View>
            );
          })}
          {row.length === 1 && <View className="flex-1" />}
        </View>
      ))}
    </View>
  );
}
