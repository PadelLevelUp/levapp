import { Ionicons } from "@expo/vector-icons";
import { evaluationApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";

interface CategoryDraft {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
  isNew?: boolean;
}

/**
 * Evaluation categories editor, mirroring web's EvaluationCategoriesSection.
 *
 * Two deliberate differences from web:
 * - No drag-to-reorder. Web has one, but `addEvaluationCategories` posts only
 *   {name, scaleMin, scaleMax} with no order field, so web's reordering is
 *   never persisted. Porting a control that does nothing would be worse than
 *   omitting it.
 * - Rows STACK. Web lays 5 controls on one grid row and only collapses at
 *   `sm`; on a 390pt phone that is what pushed a delete button off-screen.
 *   Here a row is two lines — name + delete, then min + max — and every
 *   control is `flex-1`, so nothing has a fixed pixel width to overflow.
 */
export function EvaluationCategoriesSection() {
  const { t } = useTranslation();

  const [categories, setCategories] = React.useState<CategoryDraft[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    evaluationApi
      .getEvaluationCategories()
      .then((data) => {
        if (cancelled) return;
        setCategories(
          data.map((c) => ({
            id: c.id,
            name: c.name,
            scaleMin: c.scaleMin,
            scaleMax: c.scaleMax,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setStatus(t("common.somethingWentWrong"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleAdd = () => {
    setCategories((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: "",
        scaleMin: 0,
        scaleMax: 10,
        isNew: true,
      },
    ]);
  };

  const handleChange = (
    id: string,
    field: "name" | "scaleMin" | "scaleMax",
    value: string
  ) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              [field]: field === "name" ? value : Number(value.replace(/[^0-9-]/g, "")) || 0,
            }
          : c
      )
    );
  };

  const handleRemove = async (cat: CategoryDraft) => {
    // A locally-added row was never persisted, so there is nothing to DELETE.
    if (cat.isNew) {
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      return;
    }
    setRemovingId(cat.id);
    try {
      await evaluationApi.deleteEvaluationCategory(cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    } catch {
      setStatus(t("settings.evaluationCategories.deleteFailed"));
    } finally {
      setRemovingId(null);
    }
  };

  const handleSave = async () => {
    const invalid = categories.some(
      (c) => !c.name.trim() || c.scaleMin >= c.scaleMax
    );
    if (invalid) {
      setStatus(t("settings.evaluationCategories.validationErrorDescription"));
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await evaluationApi.addEvaluationCategories(
        categories.map((c) => ({
          name: c.name,
          scaleMin: c.scaleMin,
          scaleMax: c.scaleMax,
        }))
      );
      setStatus(
        t("settings.evaluationCategories.saved", { count: categories.length })
      );
    } catch {
      setStatus(t("settings.evaluationCategories.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card testID="settings-evaluation-categories">
      <CardHeader>
        <CardTitle>{t("settings.evaluationCategories.title")}</CardTitle>
        <CardDescription>
          {t("settings.evaluationCategories.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {loading ? (
          <View className="gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </View>
        ) : (
          <>
            {categories.length === 0 ? (
              <Text className="py-2 text-center text-sm text-muted-foreground">
                {t("settings.evaluationCategories.empty")}
              </Text>
            ) : null}

            {categories.map((cat) => (
              <View
                key={cat.id}
                testID="evaluation-category-row"
                className="gap-2 rounded-lg border border-border p-2"
              >
                <View className="flex-row items-center gap-2">
                  <Input
                    className="flex-1"
                    accessibilityLabel={t("settings.evaluationCategories.name")}
                    placeholder={t(
                      "settings.evaluationCategories.namePlaceholder"
                    )}
                    value={cat.name}
                    onChangeText={(v) => handleChange(cat.id, "name", v)}
                  />
                  <Pressable
                    accessibilityLabel={t("settings.mobile.removeCategory", {
                      name: cat.name || t("settings.evaluationCategories.name"),
                    })}
                    role="button"
                    disabled={removingId === cat.id}
                    onPress={() => void handleRemove(cat)}
                    className="p-2"
                  >
                    {removingId === cat.id ? (
                      <Spinner size="small" />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={lightTheme.destructive}
                      />
                    )}
                  </Pressable>
                </View>

                <View className="flex-row gap-2">
                  <View className="flex-1 gap-1">
                    <Text className="text-[10px] font-medium uppercase text-muted-foreground">
                      {t("settings.evaluationCategories.min")}
                    </Text>
                    <Input
                      accessibilityLabel={t("settings.evaluationCategories.min")}
                      keyboardType="number-pad"
                      value={String(cat.scaleMin)}
                      onChangeText={(v) => handleChange(cat.id, "scaleMin", v)}
                    />
                  </View>
                  <View className="flex-1 gap-1">
                    <Text className="text-[10px] font-medium uppercase text-muted-foreground">
                      {t("settings.evaluationCategories.max")}
                    </Text>
                    <Input
                      accessibilityLabel={t("settings.evaluationCategories.max")}
                      keyboardType="number-pad"
                      value={String(cat.scaleMax)}
                      onChangeText={(v) => handleChange(cat.id, "scaleMax", v)}
                    />
                  </View>
                </View>
              </View>
            ))}

            {status ? (
              <Text
                testID="settings-evaluation-categories-status"
                className="text-sm text-muted-foreground"
              >
                {status}
              </Text>
            ) : null}

            {/* Two buttons, both flex-1 — they share one line at any width. */}
            <View className="flex-row gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                testID="settings-evaluation-categories-add"
                accessibilityLabel={t(
                  "settings.evaluationCategories.addCategory"
                )}
                onPress={handleAdd}
              >
                <Text>{t("settings.evaluationCategories.addCategory")}</Text>
              </Button>
              <Button
                size="sm"
                className="flex-1"
                testID="settings-evaluation-categories-save"
                accessibilityLabel={t(
                  "settings.evaluationCategories.saveCategories"
                )}
                disabled={saving || categories.length === 0}
                onPress={() => void handleSave()}
              >
                <Text>
                  {saving
                    ? t("settings.evaluationCategories.saving")
                    : t("settings.evaluationCategories.saveCategories")}
                </Text>
              </Button>
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
