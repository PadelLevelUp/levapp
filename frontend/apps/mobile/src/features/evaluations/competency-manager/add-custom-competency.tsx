import { evaluationApiErrorCode, useCreateCustomCompetency } from "@levelup/hooks";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

interface AddCustomCompetencyProps {
  /** PAD-431 (rule 15): add a sub-category of this category; absent, a new category. */
  parentId?: number;
  /** The section the field belongs to, for its test ids (`competency-add-sub-<section>-…`). */
  sectionId?: string;
}

/**
 * A new category, or a sub-category of one (evaluations.competencies rules 6, 15). The server
 * trims and decides: 409 `duplicate_name` and 400 `name_invalid` are shown under the field, and
 * what the coach typed stays there to be corrected.
 */
export function AddCustomCompetency({ parentId, sectionId }: AddCustomCompetencyProps = {}) {
  const { t } = useTranslation();
  const create = useCreateCustomCompetency();
  const [name, setName] = React.useState("");
  const [errorKey, setErrorKey] = React.useState<string | null>(null);
  const sub = parentId !== undefined;
  const testID = sub ? `competency-add-sub-${sectionId}` : "competency-add";

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    setErrorKey(null);
    try {
      await create.mutateAsync(sub ? { name: trimmed, parentId } : trimmed);
      setName("");
    } catch (error) {
      const code = evaluationApiErrorCode(error);
      setErrorKey(code === "duplicate_name" ? "duplicateName" : code === "name_invalid" ? "nameInvalid" : "saveFailed");
    }
  };

  return (
    <View testID={testID} className={sub ? "gap-1" : "gap-2"}>
      <Text className={sub ? "text-xs text-muted-foreground" : "text-sm font-medium"}>
        {t(sub ? "evaluations.manager.subTitle" : "evaluations.manager.customTitle")}
      </Text>
      <View className="flex-row items-center gap-2">
        <Input
          className="flex-1"
          testID={`${testID}-name`}
          accessibilityLabel={t(sub ? "evaluations.manager.subNamePlaceholder" : "evaluations.manager.namePlaceholder")}
          placeholder={t(sub ? "evaluations.manager.subNamePlaceholder" : "evaluations.manager.namePlaceholder")}
          value={name}
          maxLength={100}
          autoCorrect={false}
          returnKeyType="done"
          onChangeText={(value) => { setName(value); setErrorKey(null); }}
          onSubmitEditing={() => void submit()}
        />
        <Button testID={`${testID}-submit`} size={sub ? "sm" : "default"} disabled={create.isPending} onPress={() => void submit()}>
          <Text>{t("evaluations.manager.add")}</Text>
        </Button>
      </View>
      {errorKey ? (
        <Text testID={`${testID}-error`} role="alert" className="text-xs text-destructive">
          {t(`evaluations.manager.${errorKey}`)}
        </Text>
      ) : null}
    </View>
  );
}
