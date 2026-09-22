import { Ionicons } from "@expo/vector-icons";
import { activeCount, lightTheme, managerSections } from "@levelup/config";
import { useEvaluationCompetencies } from "@levelup/hooks";
import type { EvaluationCompetency } from "@levelup/types";
import { useRouter } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

import { AddCustomCompetency } from "./add-custom-competency";
import { CompetencyRow, managerRowId } from "./competency-row";
import { DeleteCompetencyDialog } from "./delete-competency-dialog";

/**
 * "Gerir competências" on iOS (PAD-373; evaluations.competencies rules 5-9, 11-14): a
 * PUSHED screen, not a native Modal sheet (rule 14), reached through
 * `openCompetencyManager(router)` from Settings and from the evaluation surfaces. The same
 * sections, rows and test ids as web's `CompetencyManager`.
 *
 * Nothing here is a draft — every toggle, rename and addition applies when made — so
 * "Concluído" and the back chevron both simply leave (rule 12). A ScrollView, not a
 * FlatList: the list is a few dozen rows at most, and it holds inputs.
 */
export function CompetencyManagerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;
  const competencies = useEvaluationCompetencies(isCoach);
  const [deleting, setDeleting] = React.useState<EvaluationCompetency | null>(null);

  React.useEffect(() => {
    // coach-only (rule 11). `replace`, not `back`: a student cold-launched on the deep
    // link has no history to pop and would sit on a blank screen (Session-B, #361).
    if (user && !isCoach) router.replace("/settings");
  }, [user, isCoach, router]);

  if (!isCoach) return null;

  const sections = competencies.data ? managerSections(competencies.data) : [];

  return (
    <Screen edges={["top", "bottom"]} testID="competency-manager">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" testID="competency-manager-back"
          accessibilityLabel={t("evaluations.manager.close")} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={lightTheme.foreground} />
        </Button>
        <Text role="heading" aria-level={1} className="flex-1 text-xl font-bold" numberOfLines={1}>
          {t("evaluations.manager.title")}
        </Text>
      </View>

      <KeyboardAvoidingView behavior={keyboardAvoidingBehavior()} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-6 p-4 pb-12">
          <Text testID="competency-manager-caption" className="text-sm text-muted-foreground">
            {t("evaluations.manager.caption")}
          </Text>

          {competencies.isError ? (
            <ErrorState
              testID="competency-manager-load-failed"
              message={t("evaluations.manager.loadFailed")}
              onRetry={() => void competencies.refetch()}
            />
          ) : !competencies.data ? (
            <View testID="competency-manager-loading" className="gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </View>
          ) : (
            <>
              {sections.map((section) => (
                <View key={section.group} className="gap-1">
                  <Text testID={`competency-group-${section.group}`} role="heading" aria-level={2}
                    className="text-xs font-semibold uppercase text-muted-foreground">
                    {section.group === "legacy"
                      ? t("evaluations.manager.legacyTitle")
                      : t(`evaluations.groups.${section.group}`)}
                  </Text>
                  {section.group === "legacy" ? (
                    <Text testID="competency-group-legacy-caption" className="text-xs text-muted-foreground">
                      {t("evaluations.manager.legacyCaption")}
                    </Text>
                  ) : null}
                  {section.rows.map((row) => (
                    <CompetencyRow key={managerRowId(row)} row={row} onDelete={setDeleting} />
                  ))}
                </View>
              ))}
              {/* Below the rows, never above them (Session-B, #361): appearing above would move
                  every switch under the finger the moment the last one is turned off. */}
              {activeCount(competencies.data) === 0 ? (
                <Text testID="competency-none-active" className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                  {t("evaluations.manager.noneActive")}
                </Text>
              ) : null}
              <AddCustomCompetency />
            </>
          )}

          <Button testID="competency-manager-done" onPress={() => router.back()}>
            <Text>{t("evaluations.manager.done")}</Text>
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      <DeleteCompetencyDialog competency={deleting} onClose={() => setDeleting(null)} />
    </Screen>
  );
}
