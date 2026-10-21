import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * PAD-551 (`classes.instance-enrollment` rule 13): a player's side in one occurrence, for the
 * coach — the tag "Esquerdo/Direito nesta aula" when set here, and the control "Lado nesta aula:
 * Habitual / Esquerdo / Direito" while the server says it may still change. One component for the
 * attendance rows and the participant sheet; the twin of web's SideInOccurrenceControl.
 */
export interface SideInOccurrence {
  current: "left" | "right" | "both" | null;
  override: boolean;
  editable: boolean;
  busy?: boolean;
  /** `null` goes back to the usual side. */
  onChange: (side: "left" | "right" | null) => void;
}

export function SideInOccurrenceControl({ playerId, side }: { playerId: string; side: SideInOccurrence }) {
  const { t } = useTranslation();
  return (
    <>
      {side.override && (side.current === "left" || side.current === "right") ? (
        <Text testID={`participant-side-${playerId}`} className="text-xs font-medium">
          {t(`calendar.side.tag.${side.current}`)}
        </Text>
      ) : null}
      {side.editable ? (
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-muted-foreground">{t("calendar.side.label")}</Text>
          {(["usual", "left", "right"] as const).map((v) => {
            const selected = side.override ? side.current === v : v === "usual";
            return (
              <Button
                key={v}
                testID={`participant-side-${v}-${playerId}`}
                accessibilityState={{ selected, disabled: !!side.busy }}
                accessibilityLabel={`${t("calendar.side.label")}: ${t(`calendar.side.${v}`)}`}
                variant={selected ? "default" : "outline"}
                size="sm"
                disabled={side.busy}
                onPress={() => {
                  if (selected) return;
                  side.onChange(v === "usual" ? null : v);
                }}
              >
                <Text className="text-xs">{t(`calendar.side.${v}`)}</Text>
              </Button>
            );
          })}
        </View>
      ) : null}
    </>
  );
}
