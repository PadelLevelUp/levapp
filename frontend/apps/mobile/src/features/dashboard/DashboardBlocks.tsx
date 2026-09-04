import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type {
  DashboardBlock,
  DashboardClassListBlock,
  DashboardIcon,
  DashboardKpiGridBlock,
  DashboardMessagesOverviewBlock,
} from "@levelup/types";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { parseDashboardItemId } from "@/features/calendar/params";

const ICON_MAP: Record<DashboardIcon, keyof typeof Ionicons.glyphMap> = {
  users: "people-outline",
  calendar: "calendar-outline",
  clipboard_check: "checkbox-outline",
  trending_up: "trending-up-outline",
  user_plus: "person-add-outline",
  check_circle: "checkmark-circle-outline",
  x_circle: "close-circle-outline",
  mail: "mail-outline",
};

/** "Revenue (est.)" → "revenue-est" — stable key for dashboard-kpi-<key>. */
export function kpiKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Web hrefs that have a mobile screen equivalent. `href` is optional (PAD-76). */
function mapHref(href: string | undefined): string | null {
  if (!href) return null;
  if (href.startsWith("/players")) return "/(tabs)/players";
  if (href.startsWith("/calendar")) return "/(tabs)/calendar";
  if (href.startsWith("/messages")) return "/(tabs)/messages";
  return null;
}

/**
 * PAD-77 (mirrored from apps/web KpiGridBlock / ClassListBlock): the backend
 * emits KPI labels and class-list titles as English literals. Map the stable
 * slug / block id to an i18n key so they respect the selected language;
 * unknown ones fall back to the raw backend string. Kept identical to web on
 * purpose — the two platforms drifted once already.
 */
const KPI_LABEL_KEYS: Record<string, string> = {
  players: "dashboard.kpi.players",
  "upcoming-classes": "dashboard.kpi.upcomingClasses",
  "pending-validation": "dashboard.kpi.pendingValidation",
  "revenue-est": "dashboard.kpi.revenue",
  attended: "dashboard.kpi.attended",
  missed: "dashboard.kpi.missed",
  "upcoming-lessons": "dashboard.kpi.upcomingLessons",
  invites: "dashboard.kpi.invites",
};

const LIST_TITLE_KEYS: Record<string, string> = {
  upcoming_classes: "dashboard.list.upcomingClasses",
  needs_players: "dashboard.list.needsPlayers",
  player_upcoming: "dashboard.list.yourUpcomingLessons",
  player_invites: "dashboard.list.invitesToConfirm",
};

const LIST_EMPTY_KEYS: Record<string, string> = {
  needs_players: "dashboard.list.allClassesFull",
  player_invites: "dashboard.list.noPendingInvites",
};

function KpiGrid({ block }: { block: DashboardKpiGridBlock }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap" style={{ margin: -6 }}>
      {block.data.items.map((item) => {
        const target = mapHref(item.href);
        const labelKey = KPI_LABEL_KEYS[kpiKey(item.label)];
        const label = labelKey ? t(labelKey) : item.label;
        const tileContent = (
          <>
            <View className="flex-row items-center justify-between">
              <Text
                className="flex-1 text-xs font-medium text-muted-foreground"
                numberOfLines={1}
              >
                {label}
              </Text>
              <Ionicons
                name={ICON_MAP[item.icon] ?? "help-circle-outline"}
                size={16}
                color={lightTheme.mutedForeground}
              />
            </View>
            <Text className="mt-2 text-2xl font-bold">
              {item.prefix ?? ""}
              {item.value}
            </Text>
          </>
        );
        return (
          <View key={item.label} className="w-1/2" style={{ padding: 6 }}>
            {target ? (
              <Pressable
                testID={`dashboard-kpi-${kpiKey(item.label)}`}
                // Label carries the value too: the accessible container hides
                // its child Text nodes from VoiceOver/UI tests otherwise.
                accessibilityLabel={`${label}: ${item.prefix ?? ""}${item.value}`}
                role="button"
                onPress={() => router.navigate(target as never)}
                className="rounded-xl border border-border bg-card p-4 active:bg-accent"
              >
                {tileContent}
              </Pressable>
            ) : (
              <View
                testID={`dashboard-kpi-${kpiKey(item.label)}`}
                accessibilityLabel={`${label}: ${item.prefix ?? ""}${item.value}`}
                className="rounded-xl border border-border bg-card p-4"
              >
                {tileContent}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function openClassListItem(item: DashboardClassListBlock["data"]["items"][number]) {
  const parsed = parseDashboardItemId(item.id);
  if (parsed) {
    router.push({
      pathname: "/class/[id]",
      params: {
        id: item.id,
        model: parsed.model,
        originalId: String(parsed.originalId),
        date: parsed.date,
        title: item.title,
        displayDate: item.dateLabel,
        displayTime: item.timeLabel,
        isRecurring: parsed.date ? "1" : "0",
      },
    });
  } else {
    router.navigate("/(tabs)/calendar" as never);
  }
}

function ClassList({ block }: { block: DashboardClassListBlock }) {
  const { t } = useTranslation();
  const isUpcoming =
    block.id === "upcoming_classes" || block.id === "player_upcoming";
  const itemTestID = isUpcoming
    ? "dashboard-upcoming-class"
    : `dashboard-class-item-${block.id}`;

  const titleKey = LIST_TITLE_KEYS[block.id];
  const title = titleKey ? t(titleKey) : block.data.title;

  const emptyKey = LIST_EMPTY_KEYS[block.id];
  const emptyText = emptyKey ? t(emptyKey) : block.data.emptyText;

  // The "needs players" badge arrives as the English literal "Missing <n>".
  // Translate it through the count so it localizes; anything else renders raw.
  const badgeLabel = (badge?: string): string | undefined => {
    if (!badge) return undefined;
    const m = /^Missing (\d+)$/.exec(badge);
    return m ? t("dashboard.list.missingSeats", { count: Number(m[1]) }) : badge;
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        {block.data.icon ? (
          <Ionicons
            name={ICON_MAP[block.data.icon] ?? "help-circle-outline"}
            size={16}
            color={lightTheme.mutedForeground}
            accessibilityLabel={
              block.data.icon === "user_plus"
                ? t("dashboard.addParticipants")
                : undefined
            }
          />
        ) : null}
      </CardHeader>
      <CardContent className="gap-2">
        {block.data.items.map((item) => (
          <Pressable
            key={item.id}
            testID={itemTestID}
            accessibilityLabel={item.title}
            role="button"
            onPress={() => openClassListItem(item)}
            className="flex-row items-center gap-3 rounded-lg bg-muted p-3 active:bg-accent"
          >
            <View
              className="h-10 w-1 rounded-full"
              style={{ backgroundColor: item.color ?? lightTheme.primary }}
            />
            <View className="flex-1">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-shrink font-medium" numberOfLines={1}>
                  {item.title}
                </Text>
                {item.badge ? (
                  <Badge variant="secondary">
                    <Text>{badgeLabel(item.badge)}</Text>
                  </Badge>
                ) : null}
              </View>
              <Text className="text-sm text-muted-foreground">
                {item.dateLabel} · {item.timeLabel}
              </Text>
            </View>
            {item.rightLabel ? (
              <Text className="text-sm text-muted-foreground">
                {item.rightLabel}
              </Text>
            ) : null}
          </Pressable>
        ))}
        {block.data.items.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            {emptyText ?? t("dashboard.list.nothingHereYet")}
          </Text>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MessagesOverview({
  block,
}: {
  block: DashboardMessagesOverviewBlock;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID="dashboard-messages-overview"
      accessibilityLabel={t("dashboard.messagesOverviewAria")}
      role="button"
      onPress={() => router.navigate("/(tabs)/messages" as never)}
    >
      <Card className="active:bg-accent">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {t("dashboard.unreadMessages")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <View className="flex-row items-end justify-between">
            <Text className="text-2xl font-bold">
              {block.data.unreadMessages}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {t("dashboard.conversationsToReplyCount", {
                count: block.data.conversationsToReply,
              })}
            </Text>
          </View>
          {block.data.latest ? (
            <Text className="mt-1 text-sm text-muted-foreground" numberOfLines={1}>
              {block.data.latest.sender}: {block.data.latest.preview}
            </Text>
          ) : null}
        </CardContent>
      </Card>
    </Pressable>
  );
}

function renderBlock(block: DashboardBlock): React.ReactNode {
  switch (block.type) {
    case "messages_overview":
      return <MessagesOverview key={block.id} block={block} />;
    case "kpi_grid":
      return <KpiGrid key={block.id} block={block} />;
    case "class_list":
      return <ClassList key={block.id} block={block} />;
    case "grid":
      // Mobile is single-column: flatten grid children into the stack.
      return (
        <View key={block.id} className="gap-4">
          {block.data.children.map((child) => renderBlock(child))}
        </View>
      );
    default:
      // Unknown block types from newer backends are skipped, not fatal.
      return null;
  }
}

export function DashboardBlocks({ blocks }: { blocks: DashboardBlock[] }) {
  return <View className="gap-4">{blocks.map((block) => renderBlock(block))}</View>;
}
