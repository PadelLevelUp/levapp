import { evaluationApiErrorCode, useCreateCustomCompetency } from "@levelup/hooks";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/**
 * "Competência personalizada" (evaluations.competencies rule 6). The server trims and
 * decides: 409 `duplicate_name` and 400 `name_invalid` are shown under the field, and what
 * the coach typed stays there to be corrected.
 */
export function AddCustomCompetency() {
  const { t } = useTranslation();
  const create = useCreateCustomCompetency();
  const [name, setName] = React.useState("");
  const [errorKey, setErrorKey] = React.useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    setErrorKey(null);
    try {
      await create.mutateAsync(trimmed);
      setName("");
    } catch (error) {
      const code = evaluationApiErrorCode(error);
      setErrorKey(code === "duplicate_name" ? "duplicateName" : code === "name_invalid" ? "nameInvalid" : "saveFailed");
    }
  };

  return (
    <View testID="competency-add" className="gap-2">
      <Text className="text-sm font-medium">{t("evaluations.manager.customTitle")}</Text>
      <View className="flex-row items-center gap-2">
        <Input
          className="flex-1"
          testID="competency-add-name"
          accessibilityLabel={t("evaluations.manager.namePlaceholder")}
          placeholder={t("evaluations.manager.namePlaceholder")}
          value={name}
          maxLength={100}
          autoCorrect={false}
          returnKeyType="done"
          onChangeText={(value) => { setName(value); setErrorKey(null); }}
          onSubmitEditing={() => void submit()}
        />
        <Button testID="competency-add-submit" disabled={create.isPending} onPress={() => void submit()}>
          <Text>{t("evaluations.manager.add")}</Text>
        </Button>
      </View>
      {errorKey ? (
        <Text testID="competency-add-error" role="alert" className="text-xs text-destructive">
          {t(`evaluations.manager.${errorKey}`)}
        </Text>
      ) : null}
    </View>
  );
}
