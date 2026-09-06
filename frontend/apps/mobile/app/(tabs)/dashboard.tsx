import { useDashboard } from "@levelup/hooks";
import { COACH_DASHBOARD_ID } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, View } from "react-native";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { CoachDashboard } from "@/features/dashboard/CoachDashboard";
import { StudentDashboard } from "@/features/dashboard/StudentDashboard";

export default function DashboardScreen() {
  const { t } = useTranslation();
  // Same window the web dashboard uses: now → +30 days. Computed once so the
  // query key stays stable across renders.
  const [range] = React.useState(() => ({
    from: new Date().toISOString(),
    to: new Date(Date.now() + 30 * 86400000).toISOString(),
  }));

  const { data, isPending, isError, refetch, isRefetching } =
    useDashboard(range);

  return (
    <Screen testID="screen-dashboard">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4 pb-8"
        refreshControl={
          <RefreshControl
            refreshing={!isPending && isRefetching}
            onRefresh={() => refetch()}
          />
        }
      >
        {/* No in-screen title. "Dashboard" belongs to the navigation alone, and
            the navy app bar carries the greeting + date as the orientation
            instead — see app/(tabs)/_layout.tsx. */}
        {isError ? (
          <ErrorState
            message={t("dashboard.failedToLoad")}
            onRetry={() => refetch()}
            className="py-16"
          />
        ) : isPending ? (
          <View className="gap-4">
            <View className="flex-row gap-3">
              <Skeleton className="h-24 flex-1" />
              <Skeleton className="h-24 flex-1" />
            </View>
            <View className="flex-row gap-3">
              <Skeleton className="h-24 flex-1" />
              <Skeleton className="h-24 flex-1" />
            </View>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </View>
        ) : data?.id === COACH_DASHBOARD_ID ? (
          // The payload id is the switch (dashboard.blocks rule 3b): both
          // homes share block types, so sniffing them would be a guess.
          <CoachDashboard blocks={data.blocks} />
        ) : (
          <StudentDashboard blocks={data?.blocks ?? []} />
        )}
      </ScrollView>
    </Screen>
  );
}
