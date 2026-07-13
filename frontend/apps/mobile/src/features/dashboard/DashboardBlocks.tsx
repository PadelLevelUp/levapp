import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type {
  DashboardBlock,
  DashboardClassListBlock,
  DashboardIcon,
  DashboardKpiGridBlock,
  DashboardMessagesOverviewBlock,
  DashboardNotificationActivityBlock,
} from "@levelup/types";
import { formatDistanceToNow } from "date-fns";
import { router } from "expo-router";
import * as React from "react";
import { Pressable, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { parseDashboardItemId } from "@/features/calendar/params";
import { cn } from "@/lib/utils";

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

/** Web hrefs that have a mobile screen equivalent. */
function mapHref(href: string): string | null {
  if (href.startsWith("/players")) return "/(tabs)/players";
  if (href.startsWith("/calendar")) return "/(tabs)/calendar";
  if (href.startsWith("/messages")) return "/(tabs)/messages";
  return null;
}

function KpiGrid({ block }: { block: DashboardKpiGridBlock }) {
  return (
    <View className="flex-row flex-wrap" style={{ margin: -6 }}>
      {block.data.items.map((item) => {
        const target = mapHref(item.href);
        const tileContent = (
          <>
            <View className="flex-row items-center justify-between">
              <Text
                className="flex-1 text-xs font-medium text-muted-foreground"
                numberOfLines={1}
              >
                {item.label}
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
                accessibilityLabel={`${item.label}: ${item.prefix ?? ""}${item.value}`}
                role="button"
                onPress={() => router.navigate(target as never)}
                className="rounded-xl border border-border bg-card p-4 active:bg-accent"
              >
                {tileContent}
              </Pressable>
            ) : (
              <View
                testID={`dashboard-kpi-${kpiKey(item.label)}`}
                accessibilityLabel={`${item.label}: ${item.prefix ?? ""}${item.value}`}
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
  const isUpcoming =
    block.id === "upcoming_classes" || block.id === "player_upcoming";
  const itemTestID = isUpcoming
    ? "dashboard-upcoming-class"
    : `dashboard-class-item-${block.id}`;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{block.data.title}</CardTitle>
        {block.data.icon ? (
          <Ionicons
            name={ICON_MAP[block.data.icon] ?? "help-circle-outline"}
            size={16}
            color={lightTheme.mutedForeground}
            accessibilityLabel={
              block.data.icon === "user_plus" ? "Add participants" : undefined
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
                    <Text>{item.badge}</Text>
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
            {block.data.emptyText ?? "Nothing here yet."}
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
  return (
    <Pressable
      testID="dashboard-messages-overview"
      accessibilityLabel="Messages overview"
      role="button"
      onPress={() => router.navigate("/(tabs)/messages" as never)}
    >
      <Card className="active:bg-accent">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Unread messages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <View className="flex-row items-end justify-between">
            <Text className="text-2xl font-bold">
              {block.data.unreadMessages}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {block.data.conversationsToReply} conversation
              {block.data.conversationsToReply === 1 ? "" : "s"} to reply
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

/** Mirrors web's STATUS_STYLES (NotificationActivityBlock.tsx) so status
 * pills match across platforms: pale fill + matching text, raw lowercase status. */
const STATUS_STYLES: Record<string, { badge: string; text: string }> = {
  sent: { badge: "bg-blue-100", text: "text-blue-700" },
  confirmed: { badge: "bg-green-100", text: "text-green-700" },
  expired: { badge: "bg-gray-100", text: "text-gray-500" },
  queued: { badge: "bg-yellow-100", text: "text-yellow-700" },
};

function NotificationActivity({
  block,
}: {
  block: DashboardNotificationActivityBlock;
}) {
  return (
    <Card testID="dashboard-notification-activity">
      <CardHeader className="flex-row items-center gap-2">
        <Ionicons
          name="notifications-outline"
          size={16}
          color={lightTheme.mutedForeground}
        />
        <CardTitle className="text-base">{block.data.title}</CardTitle>
      </CardHeader>
      <CardContent className="gap-2">
        {block.data.items.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            No notification activity yet.
          </Text>
        ) : (
          block.data.items.map((item) => (
            <View
              key={item.id}
              className="flex-row items-start gap-3 rounded-lg bg-muted p-3"
            >
              <Ionicons
                name={item.type === "manual" ? "send-outline" : "notifications-outline"}
                size={14}
                color={lightTheme.mutedForeground}
                style={{ marginTop: 2 }}
              />
              <View className="flex-1">
                <Text className="text-sm font-medium" numberOfLines={1}>
                  {item.player.name ?? "Unknown student"}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {item.lessonInstance.title ?? "Class"}
                  {item.createdAt
                    ? ` · ${formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}`
                    : ""}
                </Text>
              </View>
              <Badge
                variant="outline"
                className={cn(
                  "border-transparent",
                  STATUS_STYLES[item.status]?.badge ?? "bg-muted"
                )}
              >
                <Text className={STATUS_STYLES[item.status]?.text ?? "text-muted-foreground"}>
                  {item.status}
                </Text>
              </Badge>
            </View>
          ))
        )}
      </CardContent>
    </Card>
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
    case "notification_activity":
      return <NotificationActivity key={block.id} block={block} />;
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
