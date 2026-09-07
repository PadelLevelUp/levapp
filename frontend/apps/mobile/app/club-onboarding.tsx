import { Ionicons } from "@expo/vector-icons";
import { clubsApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { router, useFocusEffect } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { postLoginRoute } from "@/auth/postLoginRoute";
import { LevAppMark } from "@/components/brand/LevAppMark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

type Mode = "choose" | "create" | "join";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_CHARS = 2;

/**
 * clubs.join-request rule 7 — an approved coach with no club picks one here.
 * Mirrors web's ClubOnboardingPage: create a club (→ tabs) or search and ask
 * to join one (→ pending state with Withdraw / "Create my own club instead").
 * `refreshUser()` after every write keeps `postLoginRoute` in step; focusing
 * the screen re-reads /auth/me so an approved request moves the coach on.
 */
export default function ClubOnboardingScreen() {
  const { t } = useTranslation();
  const { user, logout, refreshUser } = useAuth();

  const [mode, setMode] = React.useState<Mode>("choose");
  const [busy, setBusy] = React.useState(false);
  const [clubName, setClubName] = React.useState("");
  const [clubLocation, setClubLocation] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<clubsApi.ClubSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  const pending = user?.pendingClubJoinRequest ?? null;

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      void refreshUser().then((me) => {
        if (cancelled || !me) return;
        const route = postLoginRoute(me);
        if (route !== "/club-onboarding") router.replace(route);
      });
      return () => {
        cancelled = true;
      };
    }, [refreshUser])
  );

  React.useEffect(() => {
    if (mode !== "join") return;
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      clubsApi
        .searchClubs(q)
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, mode]);

  const handleCreate = async () => {
    const name = clubName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await clubsApi.createClub({ name, location: clubLocation.trim() || undefined });
      const me = await refreshUser();
      toast.success(t("auth.clubOnboarding.created", { name }));
      router.replace(me ? postLoginRoute(me) : "/(tabs)/dashboard");
    } catch {
      toast.error(t("auth.clubOnboarding.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async (club: clubsApi.ClubSearchResult) => {
    setBusy(true);
    try {
      await clubsApi.createClubJoinRequest(club.id);
      await refreshUser();
      toast.success(t("auth.clubOnboarding.requested", { name: club.name }));
      setMode("choose");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 409
          ? t("auth.clubOnboarding.requestDuplicate")
          : t("auth.clubOnboarding.requestFailed")
      );
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await clubsApi.withdrawClubJoinRequest(pending.id);
      await refreshUser();
      toast.success(t("auth.clubOnboarding.withdrawn"));
    } catch {
      toast.error(t("auth.clubOnboarding.withdrawFailed"));
    } finally {
      setBusy(false);
    }
  };

  const renderBody = () => {
    if (pending && mode !== "create") {
      return (
        <View className="gap-3" testID="club-onboarding-pending">
          <View className="flex-row items-center gap-3 rounded-lg border border-border p-3">
            <Ionicons name="time-outline" size={20} color={lightTheme.mutedForeground} />
            <View className="flex-1">
              <Text className="font-medium">{pending.clubName}</Text>
              <Text className="text-sm text-muted-foreground">
                {t("auth.clubOnboarding.waitingForApproval")}
              </Text>
            </View>
          </View>
          <Text className="text-sm text-muted-foreground">{t("auth.clubOnboarding.pendingHint")}</Text>
          <Button
            variant="outline"
            testID="club-onboarding-withdraw"
            disabled={busy}
            onPress={() => void handleWithdraw()}
          >
            {busy ? <Spinner size="small" /> : <Text>{t("auth.clubOnboarding.withdraw")}</Text>}
          </Button>
          <Button
            variant="secondary"
            testID="club-onboarding-create-instead"
            onPress={() => setMode("create")}
          >
            <Text>{t("auth.clubOnboarding.createInstead")}</Text>
          </Button>
        </View>
      );
    }

    if (mode === "create") {
      return (
        <View className="gap-3" testID="club-onboarding-create-form">
          <View className="gap-1.5">
            <Label>{t("auth.clubOnboarding.clubName")}</Label>
            <Input
              value={clubName}
              onChangeText={setClubName}
              placeholder={t("auth.clubOnboarding.clubNamePlaceholder")}
              autoFocus
              testID="club-create-name"
            />
          </View>
          <View className="gap-1.5">
            <Label>{t("auth.clubOnboarding.clubLocation")}</Label>
            <Input
              value={clubLocation}
              onChangeText={setClubLocation}
              placeholder={t("auth.clubOnboarding.clubLocationPlaceholder")}
              testID="club-create-location"
            />
          </View>
          <Button
            testID="club-create-submit"
            disabled={busy || !clubName.trim()}
            onPress={() => void handleCreate()}
          >
            {busy ? (
              <Spinner size="small" color={lightTheme.primaryForeground} />
            ) : (
              <Text>{t("auth.clubOnboarding.createSubmit")}</Text>
            )}
          </Button>
          <Button variant="ghost" onPress={() => setMode("choose")} testID="club-onboarding-back">
            <Text>{t("common.back")}</Text>
          </Button>
        </View>
      );
    }

    if (mode === "join") {
      const q = query.trim();
      return (
        <View className="gap-3" testID="club-onboarding-join-form">
          <View className="gap-1.5">
            <Label>{t("auth.clubOnboarding.searchLabel")}</Label>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder={t("auth.clubOnboarding.searchPlaceholder")}
              autoFocus
              autoCapitalize="none"
              testID="club-search-input"
            />
          </View>
          {q.length < SEARCH_MIN_CHARS ? (
            <Text className="text-sm text-muted-foreground">{t("auth.clubOnboarding.searchHint")}</Text>
          ) : searching ? (
            <View className="items-center py-3">
              <Spinner />
            </View>
          ) : results.length === 0 ? (
            <Text className="text-sm text-muted-foreground" testID="club-search-empty">
              {t("auth.clubOnboarding.searchEmpty")}
            </Text>
          ) : (
            <View className="rounded-lg border border-border" testID="club-search-results">
              {results.map((club, i) => (
                <Pressable
                  key={club.id}
                  testID={`club-search-result-${club.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("auth.clubOnboarding.requestToJoin")} ${club.name}`}
                  disabled={busy}
                  onPress={() => void handleRequest(club)}
                  className={`flex-row items-center justify-between gap-3 p-3 active:bg-accent ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <View className="flex-1 flex-row items-center gap-3">
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-muted">
                      <Ionicons name="business-outline" size={16} color={lightTheme.mutedForeground} />
                    </View>
                    <View className="flex-1">
                      <Text className="font-medium" numberOfLines={1}>
                        {club.name}
                      </Text>
                      {club.location ? (
                        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                          {club.location}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Text className="text-sm font-medium text-primary">
                    {t("auth.clubOnboarding.requestToJoin")}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <Button variant="ghost" onPress={() => setMode("choose")} testID="club-onboarding-back">
            <Text>{t("common.back")}</Text>
          </Button>
        </View>
      );
    }

    return (
      <View className="gap-3">
        <Button testID="club-onboarding-create" onPress={() => setMode("create")}>
          <Text>{t("auth.clubOnboarding.createClub")}</Text>
        </Button>
        <Button variant="outline" testID="club-onboarding-join" onPress={() => setMode("join")}>
          <Text>{t("auth.clubOnboarding.joinClub")}</Text>
        </Button>
      </View>
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-sidebar"
      contentContainerClassName="flex-grow justify-center p-4"
      keyboardShouldPersistTaps="handled"
    >
      <View className="mb-6 items-center">
        <LevAppMark size={30} />
      </View>
      <Card testID="club-onboarding">
        <CardHeader className="items-center">
          <View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Ionicons name="business-outline" size={24} color={lightTheme.primary} />
          </View>
          <CardTitle className="text-center">{t("auth.clubOnboarding.title")}</CardTitle>
          <CardDescription className="text-center">{t("auth.clubOnboarding.description")}</CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          {renderBody()}
          <Button variant="ghost" testID="club-onboarding-signout" onPress={() => void logout()}>
            <Text>{t("auth.coachPending.signOut")}</Text>
          </Button>
        </CardContent>
      </Card>
    </ScrollView>
  );
}
