import * as React from "react";
import { FlatList, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { useCoachPlayersPaginated } from "@levelup/hooks";
import { sideLabel, type CoachPlayer } from "@levelup/types";
import { useRouter } from "expo-router";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const SORT_OPTIONS = [
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "level-asc", label: "Level (asc)" },
  { value: "level-desc", label: "Level (desc)" },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

function parseSort(value: SortValue) {
  const [sortBy, sortDir] = value.split("-") as [
    "name" | "level",
    "asc" | "desc",
  ];
  return { sortBy, sortDir };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function PlayersScreen() {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [sortOption, setSortOption] = React.useState<Option>({
    value: "name-asc",
    label: "Name A–Z",
  });
  const [missingLevelFilter, setMissingLevelFilter] = React.useState(false);
  const [missingSideFilter, setMissingSideFilter] = React.useState(false);

  // Debounce search — reset to page 1 on a new query (mirrors web, 300ms).
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { sortBy, sortDir } = parseSort(
    (sortOption?.value as SortValue) ?? "name-asc"
  );

  const { data, isPending, isError, refetch } = useCoachPlayersPaginated({
    page,
    perPage: PAGE_SIZE,
    search: debouncedSearch || undefined,
    sortBy,
    sortDir,
    missingLevel: missingLevelFilter,
    missingSide: missingSideFilter,
  });

  const players = data?.items ?? [];
  const totalPages = data?.pagination.pages || 1;
  const totalItems = data?.pagination.total || 0;
  const alerts = data?.alerts ?? { missingLevel: 0, missingSide: 0 };
  const hasActiveFilter = missingLevelFilter || missingSideFilter;

  const handleSortChange = (option: Option) => {
    setSortOption(option);
    setPage(1);
  };

  const toggleMissingLevel = () => {
    setMissingLevelFilter((prev) => !prev);
    setMissingSideFilter(false);
    setPage(1);
  };

  const toggleMissingSide = () => {
    setMissingSideFilter((prev) => !prev);
    setMissingLevelFilter(false);
    setPage(1);
  };

  const clearFilters = () => {
    setMissingLevelFilter(false);
    setMissingSideFilter(false);
    setPage(1);
  };

  const renderPlayer = ({ item }: { item: CoachPlayer }) => (
    <Pressable
      testID={`player-card-${item.playerId}`}
      accessibilityLabel={`Open player ${item.name}`}
      role="button"
      onPress={() => router.push(`/player/${item.playerId}`)}
      className="mb-3 rounded-lg border border-border bg-card p-4 active:bg-accent"
    >
      <View className="flex-row items-center gap-3">
        <Avatar alt={item.name || "Player"} className="h-12 w-12">
          <AvatarFallback>
            <Text className="text-primary">
              {getInitials(item.name || "")}
            </Text>
          </AvatarFallback>
        </Avatar>
        <View className="min-w-0 flex-1">
          <Text className="font-medium" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {item.email || "—"}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {item.level ? (
          <Badge variant="outline">
            <Text>{item.level.code}</Text>
          </Badge>
        ) : null}
        {item.side ? (
          <Badge variant="secondary">
            <Text>{sideLabel(item.side)}</Text>
          </Badge>
        ) : null}
      </View>
    </Pressable>
  );

  const listBody = () => {
    if (isPending) {
      return (
        <View className="gap-3 px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </View>
      );
    }
    if (isError) {
      return (
        <ErrorState
          message="Could not load your players."
          onRetry={() => refetch()}
        />
      );
    }
    if (players.length === 0) {
      return (
        <EmptyState
          icon="people-outline"
          title="No players found"
          message={
            debouncedSearch || hasActiveFilter
              ? "Try adjusting your search or filters."
              : "Add your first player to get started."
          }
        />
      );
    }
    return (
      <FlatList
        data={players}
        keyExtractor={(item) => `coach-player-${item.id}-${item.playerId}`}
        renderItem={renderPlayer}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    );
  };

  return (
    <View className="flex-1 bg-background" testID="screen-players">
      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-2">
          <Input
            testID="players-search"
            accessibilityLabel="Search players"
            placeholder="Search players..."
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            className="flex-1"
          />
          <Button
            size="icon"
            testID="players-add"
            accessibilityLabel="Add player"
            onPress={() => router.push("/player/new")}
          >
            <Ionicons
              name="add"
              size={24}
              color={lightTheme.primaryForeground}
            />
          </Button>
        </View>

        <Select value={sortOption} onValueChange={handleSortChange}>
          <SelectTrigger
            testID="players-sort"
            accessibilityLabel="Sort players"
          >
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} label={opt.label} />
            ))}
          </SelectContent>
        </Select>

        {alerts.missingLevel > 0 || alerts.missingSide > 0 ? (
          <View className="gap-2">
            {alerts.missingLevel > 0 ? (
              <Pressable
                accessibilityLabel="Filter players without level"
                role="button"
                onPress={toggleMissingLevel}
                className={cn(
                  "flex-row items-center gap-2 rounded-md border p-3",
                  missingLevelFilter
                    ? "border-warning bg-warning/10"
                    : "border-border bg-card"
                )}
              >
                <Ionicons
                  name="warning-outline"
                  size={16}
                  color={lightTheme.warning}
                />
                <Text className="flex-1 text-sm">
                  {alerts.missingLevel} player
                  {alerts.missingLevel !== 1 ? "s" : ""} without level defined
                </Text>
              </Pressable>
            ) : null}
            {alerts.missingSide > 0 ? (
              <Pressable
                accessibilityLabel="Filter players without playing side"
                role="button"
                onPress={toggleMissingSide}
                className={cn(
                  "flex-row items-center gap-2 rounded-md border p-3",
                  missingSideFilter
                    ? "border-warning bg-warning/10"
                    : "border-border bg-card"
                )}
              >
                <Ionicons
                  name="warning-outline"
                  size={16}
                  color={lightTheme.warning}
                />
                <Text className="flex-1 text-sm">
                  {alerts.missingSide} player
                  {alerts.missingSide !== 1 ? "s" : ""} without Playing Side
                  defined
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {hasActiveFilter ? (
          <View className="flex-row items-center gap-2">
            <Badge variant="secondary">
              <Text>
                {missingLevelFilter ? "Missing level" : "Missing side"} filter
                active
              </Text>
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              accessibilityLabel="Clear filter"
              onPress={clearFilters}
            >
              <Text>Clear filter</Text>
            </Button>
          </View>
        ) : null}
      </View>

      <View className="flex-1">{listBody()}</View>

      <View className="flex-row items-center justify-between border-t border-border px-4 py-3">
        <Text className="text-sm text-muted-foreground">
          Page {page} of {totalPages} • {totalItems} players
        </Text>
        <View className="flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            testID="players-prev-page"
            accessibilityLabel="Previous page"
            disabled={page <= 1}
            onPress={() => setPage((p) => Math.max(1, p - 1))}
          >
            <Text>Previous</Text>
          </Button>
          <Button
            variant="outline"
            size="sm"
            testID="players-next-page"
            accessibilityLabel="Next page"
            disabled={page >= totalPages}
            onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <Text>Next</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
