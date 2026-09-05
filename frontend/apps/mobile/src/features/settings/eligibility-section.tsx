import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { GroupRule } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
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
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  ELIGIBILITY_ATTRIBUTES,
  findAttribute,
  needsValue,
  newRule,
  removeRuleAt,
  withAttribute,
  withOperation,
} from "./eligibility-rules";

interface EligibilitySectionProps {
  /** `null`/`undefined` means no bar is defined — everyone is eligible. */
  rules: GroupRule[] | null | undefined;
  onChange: (rules: GroupRule[] | null) => void;
  disabled?: boolean;
}

function RuleRow({
  rule,
  onChange,
  onRemove,
  disabled,
}: {
  rule: GroupRule;
  onChange: (rule: GroupRule) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const attr = findAttribute(rule.attribute);
  const showValue = attr ? needsValue(attr, rule.operation) : false;
  const isPercentage = attr?.valueType === "percentage";

  const attributeOptions: Option[] = ELIGIBILITY_ATTRIBUTES.map((a) => ({
    value: a.id,
    label: t(a.labelKey),
  }));
  const operationOptions: Option[] = (attr?.operations ?? []).map((op) => ({
    value: op.id,
    label: t(op.labelKey),
  }));

  return (
    <View testID="eligibility-rule-row" className="gap-2 rounded-lg border border-border bg-background p-3">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Select
            value={attributeOptions.find((o) => o!.value === rule.attribute)}
            onValueChange={(option) =>
              option && onChange(withAttribute(option.value))
            }
            disabled={disabled}
          >
            <SelectTrigger
              testID="eligibility-attribute"
              accessibilityLabel={t("settings.eligibility.attribute")}
            >
              <SelectValue placeholder={t("settings.eligibility.attribute")} />
            </SelectTrigger>
            <SelectContent>
              {attributeOptions.map((option) => (
                <SelectItem
                  key={option!.value}
                  value={option!.value}
                  label={option!.label}
                />
              ))}
            </SelectContent>
          </Select>
        </View>

        <Pressable
          testID="eligibility-remove-rule"
          accessibilityLabel={t("settings.eligibility.removeRule")}
          role="button"
          disabled={disabled}
          onPress={onRemove}
          className="h-9 w-9 items-center justify-center rounded-md active:bg-accent"
        >
          <Ionicons name="close" size={18} color={lightTheme.mutedForeground} />
        </Pressable>
      </View>

      {attr ? (
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <Select
              value={operationOptions.find((o) => o!.value === rule.operation)}
              onValueChange={(option) =>
                option && onChange(withOperation(rule, option.value))
              }
              disabled={disabled}
            >
              <SelectTrigger
                testID="eligibility-operation"
                accessibilityLabel={t("settings.eligibility.operation")}
              >
                <SelectValue placeholder={t("settings.eligibility.operation")} />
              </SelectTrigger>
              <SelectContent>
                {operationOptions.map((option) => (
                  <SelectItem
                    key={option!.value}
                    value={option!.value}
                    label={option!.label}
                  />
                ))}
              </SelectContent>
            </Select>
          </View>

          {showValue ? (
            <View className="flex-row items-center gap-1">
              <Input
                testID="eligibility-value"
                accessibilityLabel={t("settings.eligibility.value")}
                keyboardType="number-pad"
                editable={!disabled}
                className="w-20"
                value={rule.value != null ? String(rule.value) : ""}
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, "");
                  onChange({
                    ...rule,
                    value: digits === "" ? undefined : Number(digits),
                  });
                }}
              />
              {isPercentage ? (
                <Text className="text-xs text-muted-foreground">%</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The coach's standard eligibility bar on iOS (PAD-161).
 *
 * Port of web's `EligibilitySection.tsx`. PAD-128/129 shipped it web-only
 * without recording a decision, so a coach who only ever opens the phone could
 * not see or change the rule governing their whole invitation flow.
 *
 * Presentation only — the rule transitions live in `eligibility-rules.ts`
 * (shared shape with web, unit-tested here) and the API is the existing
 * notification-engine config the parent section already saves.
 *
 * Behaviour matches web: nullable means unset, level and absences only, and
 * the bar warns rather than blocks.
 */
export function EligibilitySection({
  rules,
  onChange,
  disabled,
}: EligibilitySectionProps) {
  const { t } = useTranslation();
  const current = rules ?? [];
  const hasBar = current.length > 0;

  const updateRule = (idx: number, rule: GroupRule) => {
    const next = [...current];
    next[idx] = rule;
    onChange(next);
  };

  return (
    <View
      testID="eligibility-section"
      className={cn("gap-3", disabled && "opacity-40")}
    >
      <Text className="text-xs text-muted-foreground">
        {t("settings.eligibility.hint")}
      </Text>

      {!hasBar ? (
        <Text
          testID="eligibility-open-bar"
          className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
        >
          {t("settings.eligibility.noBar")}
        </Text>
      ) : (
        <View className="gap-2">
          {current.map((rule, idx) => (
            <RuleRow
              key={idx}
              rule={rule}
              onChange={(r) => updateRule(idx, r)}
              onRemove={() => onChange(removeRuleAt(current, idx))}
              disabled={disabled}
            />
          ))}
          <Text className="text-xs text-muted-foreground">
            {t("settings.eligibility.allRulesApply")}
          </Text>
        </View>
      )}

      <Button
        testID="eligibility-add-rule"
        accessibilityLabel={t("settings.eligibility.addRule")}
        variant="outline"
        size="sm"
        disabled={disabled}
        onPress={() => onChange([...current, newRule()])}
      >
        <Ionicons name="add" size={16} color={lightTheme.foreground} />
        <Text>{t("settings.eligibility.addRule")}</Text>
      </Button>
    </View>
  );
}
