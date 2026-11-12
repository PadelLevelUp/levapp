import { Ionicons } from "@expo/vector-icons";
import {
  FIXED_TIERS,
  MAX_TIERS,
  SIDE_BALANCE_EXAMPLES,
  lightTheme,
  ruleForAttribute,
  tierAttributesFor,
  type TierAttribute,
} from "@levelup/config";
import type { EngineConfig, EngineTimingPair, GroupRule, InvitationGroup } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type Option } from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { addGroup, moveGroup, perTierFor, removeGroup, setTierPair, tierIndexOfGroup } from "./engine-config-edits";
import { EngineStepper } from "./engine-stepper";

/**
 * PAD-920 (notifications.config rule 20): the tiers editor, iOS's first editor of the invitation
 * groups (it had none before the swap; the coordinator's ruling on PAD-912 ports it). The coach's list
 * and the students' list are the two fixed tiers before the groups; the groups are web's
 * InvitationGroupsSection over the same `invitationGroups` wire, from the same shared catalogue
 * (`@levelup/config` invitation-tiers), reordered with up/down buttons where web drags. With the
 * `per_tier` timing method each tier also carries its own pair.
 */
export interface TiersEditorProps {
  groups: InvitationGroup[];
  engine: EngineConfig;
  /** The coach's pair, what a tier with no pair of its own uses (null sides already resolved). */
  pair: { betweenRoundsMinutes: number; betweenGroupsMinutes: number };
  onChange: (next: { groups: InvitationGroup[]; engine: EngineConfig }) => void;
  disabled?: boolean;
}

function SideBalanceHelp() {
  const { t } = useTranslation();
  return (
    <View testID="invitation-group-side-help" className="gap-0.5">
      <Text className="text-[11px] text-muted-foreground">{t("settings.invitationGroups.sideBalanceHelp.intro")}</Text>
      {SIDE_BALANCE_EXAMPLES.map((k) => (
        <Text key={k} className="text-[11px] text-muted-foreground">
          {"• "}
          {t(`settings.invitationGroups.sideBalanceHelp.${k}`)}
        </Text>
      ))}
      <Text className="text-[11px] text-muted-foreground">{t("settings.invitationGroups.sideBalanceHelp.special")}</Text>
    </View>
  );
}

function RuleRow({
  tierIndex,
  ruleIndex,
  rule,
  isTierSide,
  attributes,
  onChange,
  onRemove,
  disabled,
}: {
  tierIndex: number;
  ruleIndex: number;
  rule: GroupRule;
  /** This is the group's first side rule, whose operation is the tier's side. */
  isTierSide: boolean;
  attributes: TierAttribute[];
  onChange: (rule: GroupRule) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const attr = attributes.find((a) => a.id === rule.attribute);
  const attributeOptions: Option[] = attributes.map((a) => ({ value: a.id, label: t(a.labelKey) }));
  const operationOptions: Option[] = (attr?.operations ?? []).map((op) => ({ value: op.id, label: t(op.labelKey) }));
  const valueOptions: Option[] = (attr?.valueOptions ?? []).map((o) => ({ value: o.id, label: t(o.labelKey) }));
  // The group's first side rule's operation is the tier's side (`tier-side-<tierIndex>`, CONFIG-72), as on web.
  const operationTestID = isTierSide ? `tier-side-${tierIndex}` : `tier-operation-${tierIndex}-${ruleIndex}`;

  return (
    <View testID={`tier-rule-${tierIndex}-${ruleIndex}`} className="gap-2 rounded-md border border-border bg-background p-2">
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Select
            value={attributeOptions.find((o) => o!.value === rule.attribute)}
            onValueChange={(option) => option && onChange(ruleForAttribute(option.value))}
            disabled={disabled}
          >
            <SelectTrigger testID={`tier-attribute-${tierIndex}-${ruleIndex}`} accessibilityLabel={t("settings.invitationGroups.attribute")}>
              <SelectValue placeholder={t("settings.invitationGroups.attribute")} />
            </SelectTrigger>
            <SelectContent>
              {attributeOptions.map((option) => (
                <SelectItem key={option!.value} testID={`tier-attribute-${tierIndex}-${ruleIndex}-${option!.value}`} value={option!.value} label={option!.label} />
              ))}
            </SelectContent>
          </Select>
        </View>
        <Pressable
          testID={`tier-rule-remove-${tierIndex}-${ruleIndex}`}
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
              onValueChange={(option) => option && onChange({ ...rule, operation: option.value })}
              disabled={disabled}
            >
              <SelectTrigger testID={operationTestID} accessibilityLabel={t("settings.invitationGroups.operation")}>
                <SelectValue placeholder={t("settings.invitationGroups.operation")} />
              </SelectTrigger>
              <SelectContent>
                {operationOptions.map((option) => (
                  <SelectItem key={option!.value} testID={`${operationTestID}-${option!.value}`} value={option!.value} label={option!.label} />
                ))}
              </SelectContent>
            </Select>
          </View>
          {attr.valueType === "number" || attr.valueType === "percentage" ? (
            <View className="flex-row items-center gap-1">
              <Input
                testID={`tier-value-${tierIndex}-${ruleIndex}`}
                accessibilityLabel={t("settings.invitationGroups.value")}
                keyboardType="number-pad"
                editable={!disabled}
                className="w-16"
                value={rule.value != null ? String(rule.value) : ""}
                onChangeText={(text) => {
                  const digits = text.replace(/[^0-9]/g, "");
                  onChange({ ...rule, value: digits === "" ? undefined : Number(digits) });
                }}
              />
              {attr.valueType === "percentage" ? <Text className="text-xs text-muted-foreground">%</Text> : null}
            </View>
          ) : null}
          {attr.valueType === "select" ? (
            <View className="w-32">
              <Select
                value={valueOptions.find((o) => o!.value === String(rule.value ?? ""))}
                onValueChange={(option) => option && onChange({ ...rule, value: option.value })}
                disabled={disabled}
              >
                <SelectTrigger testID={`tier-value-${tierIndex}-${ruleIndex}`} accessibilityLabel={t("settings.invitationGroups.value")}>
                  <SelectValue placeholder={t("settings.invitationGroups.value")} />
                </SelectTrigger>
                <SelectContent>
                  {valueOptions.map((option) => (
                    <SelectItem key={option!.value} testID={`tier-value-${tierIndex}-${ruleIndex}-${option!.value}`} value={option!.value} label={option!.label} />
                  ))}
                </SelectContent>
              </Select>
            </View>
          ) : null}
        </View>
      ) : null}
      {rule.attribute === "side" && rule.operation === "same_as_vacancy" ? <SideBalanceHelp /> : null}
    </View>
  );
}

/** A tier's own pair under `per_tier`; a tier with none shows the coach's pair until stepped. */
function TierPair({
  tierIndex,
  own,
  pair,
  onChange,
  disabled,
}: {
  tierIndex: number;
  own: EngineTimingPair | null;
  pair: TiersEditorProps["pair"];
  onChange: (pair: EngineTimingPair) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const rounds = own?.betweenRoundsMinutes ?? pair.betweenRoundsMinutes;
  const groups = own?.betweenGroupsMinutes ?? pair.betweenGroupsMinutes;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-xs text-muted-foreground">{t("settings.engine.newEngine.betweenRounds")}</Text>
        <EngineStepper
          id={`tier-${tierIndex}-between-rounds`}
          boundKey="betweenRoundsMinutes"
          value={rounds}
          unit={t("settings.restrictions.min")}
          disabled={disabled}
          onChange={(v) => onChange({ betweenRoundsMinutes: v, betweenGroupsMinutes: own?.betweenGroupsMinutes ?? null })}
        />
      </View>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-xs text-muted-foreground">{t("settings.engine.newEngine.betweenGroups")}</Text>
        <EngineStepper
          id={`tier-${tierIndex}-between-groups`}
          boundKey="betweenGroupsMinutes"
          value={groups}
          unit={t("settings.restrictions.min")}
          disabled={disabled}
          onChange={(v) => onChange({ betweenRoundsMinutes: own?.betweenRoundsMinutes ?? null, betweenGroupsMinutes: v })}
        />
      </View>
    </View>
  );
}

export function TiersEditor({ groups, engine, pair, onChange, disabled }: TiersEditorProps) {
  const { t } = useTranslation();
  // CONFIG-72: this editor shows only to a coach on `new`, so "Lado contrário" is always offered here.
  const attributes = tierAttributesFor("new");
  const perTierMethod = engine.timing.method === "per_tier";
  const perTier = perTierFor(engine, groups.length);
  const setPair = (tierIndex: number, p: EngineTimingPair) =>
    onChange({ groups, engine: setTierPair(engine, groups.length, tierIndex, p) });

  const updateGroup = (index: number, group: InvitationGroup) =>
    onChange({ groups: groups.map((g, i) => (i === index ? group : g)), engine });

  const moveButton = (index: number, to: number, dir: "up" | "down") => {
    const tierIndex = tierIndexOfGroup(index);
    const off = !!disabled || to < 0 || to >= groups.length;
    return (
      <Pressable
        testID={`tier-move-${dir}-${tierIndex}`}
        accessibilityRole="button"
        accessibilityLabel={t(dir === "up" ? "settings.engine.newEngine.tiers.moveUp" : "settings.engine.newEngine.tiers.moveDown")}
        accessibilityState={{ disabled: off }}
        disabled={off}
        hitSlop={6}
        onPress={() => onChange(moveGroup(groups, engine, index, to))}
        className={off ? "opacity-30" : undefined}
      >
        <Ionicons name={dir === "up" ? "chevron-up" : "chevron-down"} size={18} color={lightTheme.mutedForeground} />
      </Pressable>
    );
  };

  return (
    <View testID="tiers-editor" className="gap-3">
      <Text className="text-xs text-muted-foreground">{t("settings.invitationGroups.sequenceHint")}</Text>

      {FIXED_TIERS.map((tier) => (
        <View key={tier.index} testID={`tier-row-${tier.index}`} className="gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <View className="flex-row items-center gap-2">
            <Ionicons name="lock-closed-outline" size={14} color={lightTheme.mutedForeground} />
            <Text className="flex-1 text-sm font-medium">{t(tier.labelKey)}</Text>
          </View>
          <Text className="text-xs text-muted-foreground">{t("settings.engine.newEngine.tiers.fixed")}</Text>
          {perTierMethod ? (
            <TierPair tierIndex={tier.index} own={perTier[tier.index]} pair={pair} onChange={(p) => setPair(tier.index, p)} disabled={disabled} />
          ) : null}
        </View>
      ))}

      {groups.map((group, index) => {
        const tierIndex = tierIndexOfGroup(index);
        return (
          <View key={group.id} testID={`tier-row-${tierIndex}`} className="gap-2 rounded-lg border border-border bg-background p-3">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-sm font-medium">{t("settings.invitationGroups.group", { number: index + 1 })}</Text>
              {moveButton(index, index - 1, "up")}
              {moveButton(index, index + 1, "down")}
              {/* Every group can go, the last one too (web the same); the two lists cannot. */}
              <Pressable
                testID={`tier-remove-${tierIndex}`}
                accessibilityRole="button"
                accessibilityLabel={t("common.remove")}
                disabled={disabled}
                hitSlop={6}
                onPress={() => onChange(removeGroup(groups, engine, index))}
              >
                <Ionicons name="close" size={18} color={lightTheme.mutedForeground} />
              </Pressable>
            </View>
            {group.rules.length === 0 ? (
              <Text className="text-xs italic text-muted-foreground">{t("settings.invitationGroups.noRules")}</Text>
            ) : null}
            {group.rules.map((rule, ruleIndex) => (
              <RuleRow
                key={ruleIndex}
                tierIndex={tierIndex}
                ruleIndex={ruleIndex}
                rule={rule}
                isTierSide={rule.attribute === "side" && group.rules.findIndex((r) => r.attribute === "side") === ruleIndex}
                attributes={attributes}
                disabled={disabled}
                onChange={(r) => updateGroup(index, { ...group, rules: group.rules.map((x, i) => (i === ruleIndex ? r : x)) })}
                onRemove={() => updateGroup(index, { ...group, rules: group.rules.filter((_, i) => i !== ruleIndex) })}
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              testID={`tier-add-rule-${tierIndex}`}
              disabled={disabled}
              onPress={() => updateGroup(index, { ...group, rules: [...group.rules, ruleForAttribute(attributes[0].id)] })}
            >
              <Text>{t("settings.invitationGroups.addRule")}</Text>
            </Button>
            {perTierMethod ? (
              <TierPair tierIndex={tierIndex} own={perTier[tierIndex]} pair={pair} onChange={(p) => setPair(tierIndex, p)} disabled={disabled} />
            ) : null}
          </View>
        );
      })}

      {groups.length > 0 && groups[groups.length - 1].rules.length > 0 ? (
        <Text className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{t("settings.invitationGroups.lastGroupHint")}</Text>
      ) : null}

      {groups.length < MAX_TIERS ? (
        <Button variant="outline" testID="tier-add" disabled={disabled} onPress={() => onChange(addGroup(groups, engine, String(Date.now())))}>
          <Text>{t("settings.invitationGroups.addGroup")}</Text>
        </Button>
      ) : null}
    </View>
  );
}
