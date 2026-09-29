import { Ionicons } from "@expo/vector-icons";
import { competencyLabel, legacyScaleLabel, lightTheme, type ManagerRow } from "@levelup/config";
import {
  evaluationApiErrorCode,
  useSwitchOnCatalogueCompetency,
  useUpdateEvaluationCompetency,
} from "@levelup/hooks";
import type { EvaluationCompetency } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";

/** The same stable id as web: the catalogue key when there is one, else the row id. */
export function managerRowId(row: ManagerRow): string {
  if (row.kind === "available") return `key-${row.entry.key}`;
  return row.competency.key ? `key-${row.competency.key}` : `id-${row.competency.id}`;
}

interface CompetencyRowProps {
  row: ManagerRow;
  onDelete: (competency: EvaluationCompetency) => void;
  /** PAD-431: a category heads its section; a sub-category is indented under it. */
  level?: "category" | "sub";
}

/**
 * One competency (evaluations.competencies rules 2, 6-8, 12) — the iOS twin of web's
 * `CompetencyRow`, same behaviour and the same test ids. Every change applies when made:
 * while its request is in flight the row is disabled (one request per tap; a ref guards
 * it, since two taps in one frame see the same state), and a failure puts the switch back
 * and says so on this row.
 */
export function CompetencyRow({ row, onDelete, level = "category" }: CompetencyRowProps) {
  const { t } = useTranslation();
  const switchOn = useSwitchOnCatalogueCompetency();
  const update = useUpdateEvaluationCompetency();
  const [wanted, setWanted] = React.useState<boolean | null>(null);
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const inFlight = React.useRef(false);

  const rowId = managerRowId(row);
  const competency = row.kind === "existing" ? row.competency : null;
  const kind = row.kind === "existing" ? row.rowKind : "available";
  const label = competency
    ? competencyLabel(t, competency)
    : competencyLabel(t, { key: row.kind === "available" ? row.entry.key : null, name: "" });
  const scale = competency ? legacyScaleLabel(competency) : null;
  const busy = wanted !== null || update.isPending || switchOn.isPending;
  const checked = wanted ?? competency?.isActive ?? false;
  // PAD-431 (rules 8, 9): every row the coach holds can be renamed and deleted, a default included.
  const editable = kind !== "available";

  const fail = (error: unknown) => {
    const code = evaluationApiErrorCode(error);
    setErrorKey(code === "duplicate_name" ? "duplicateName" : code === "name_invalid" ? "nameInvalid" : "saveFailed");
  };

  const toggle = async (next: boolean) => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setErrorKey(null);
    setWanted(next);
    try {
      if (competency) await update.mutateAsync({ id: competency.id, patch: { isActive: next } });
      else if (row.kind === "available") await switchOn.mutateAsync(row.entry.key);
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
      setWanted(null);
    }
  };

  const saveName = async () => {
    const name = draftName.trim();
    if (!competency || busy) return;
    if (!name) return setErrorKey("nameInvalid");
    if (name === competency.name) return setRenaming(false);
    setErrorKey(null);
    try {
      await update.mutateAsync({ id: competency.id, patch: { name } });
      setRenaming(false);
    } catch (error) {
      fail(error);
    }
  };

  return (
    <View testID={`competency-row-${rowId}`} className={level === "sub" ? "gap-1 border-b border-border py-2 pl-5" : "gap-1 border-b border-border py-3"}>
      {renaming && competency ? (
        <View className="gap-2">
          <Input
            testID={`competency-rename-input-${rowId}`}
            accessibilityLabel={t("evaluations.manager.rename")}
            value={draftName}
            maxLength={100}
            autoCorrect={false}
            onChangeText={setDraftName}
            onSubmitEditing={() => void saveName()}
          />
          <View className="flex-row justify-end gap-2">
            <Button variant="ghost" size="sm" onPress={() => { setRenaming(false); setErrorKey(null); }}>
              <Text>{t("evaluations.manager.renameCancel")}</Text>
            </Button>
            <Button size="sm" testID={`competency-rename-save-${rowId}`} disabled={busy} onPress={() => void saveName()}>
              <Text>{t("evaluations.manager.renameSave")}</Text>
            </Button>
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Text className={level === "sub" ? "text-base" : "text-base font-semibold"} numberOfLines={2}>{label}</Text>
            {scale ? (
              <Text testID={`competency-scale-${rowId}`} className="text-xs text-muted-foreground">
                {t("evaluations.manager.legacyScale", { scale })}
              </Text>
            ) : null}
          </View>
          {editable && competency ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                testID={`competency-rename-${rowId}`}
                accessibilityLabel={`${t("evaluations.manager.rename")}: ${label}`}
                disabled={busy}
                onPress={() => { setDraftName(competency.name); setErrorKey(null); setRenaming(true); }}
              >
                <Ionicons name="pencil" size={18} color={lightTheme.foreground} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                testID={`competency-delete-${rowId}`}
                accessibilityLabel={`${t("evaluations.manager.delete")}: ${label}`}
                disabled={busy}
                onPress={() => onDelete(competency)}
              >
                <Ionicons name="trash-outline" size={18} color={lightTheme.destructive} />
              </Button>
            </>
          ) : null}
          <Switch
            testID={`competency-toggle-${rowId}`}
            accessibilityLabel={label}
            checked={checked}
            disabled={busy}
            onCheckedChange={(next) => void toggle(next)}
          />
        </View>
      )}
      {errorKey ? (
        <Text testID={`competency-error-${rowId}`} role="alert" className="text-xs text-destructive">
          {t(`evaluations.manager.${errorKey}`)}
        </Text>
      ) : null}
    </View>
  );
}
