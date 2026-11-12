import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InvitationGroup, GroupRule } from "@/types";
import type { EngineTimingMethod, EngineTimingPair } from "@levelup/types";
import {
  DEFAULT_INVITATION_GROUPS,
  FIXED_TIERS,
  MAX_TIERS,
  SIDE_BALANCE_EXAMPLES,
  moveTier,
  perTierAfterMove,
  perTierAfterRemove,
  perTierAligned,
  tierAttributesFor,
  type TierAttribute,
} from "@levelup/config";
import { EngineStepper } from "./EngineStepper";

// PAD-920: the attributes, defaults and examples live in @levelup/config (invitation-tiers), shared
// with the iOS tiers editor. Re-exported here so existing importers keep working.
export { DEFAULT_INVITATION_GROUPS, SIDE_BALANCE_EXAMPLES };

// An old-engine coach's editor: the new engine's own operations ("other side") are not offered.
const OLD_ENGINE_ATTRIBUTES = tierAttributesFor(undefined);
const NEW_ENGINE_ATTRIBUTES = tierAttributesFor("new");

function SideBalanceHelp() {
  const { t } = useTranslation();
  return (
    <div data-testid="invitation-group-side-help" className="basis-full text-[11px] text-muted-foreground space-y-0.5 pl-1">
      <p>{t("settings.invitationGroups.sideBalanceHelp.intro")}</p>
      <ul className="list-disc ml-4">
        {SIDE_BALANCE_EXAMPLES.map((k) => (
          <li key={k}>{t(`settings.invitationGroups.sideBalanceHelp.${k}`)}</li>
        ))}
      </ul>
      <p>{t("settings.invitationGroups.sideBalanceHelp.special")}</p>
    </div>
  );
}

function RuleRow({
  rule,
  attributes,
  operationTestId,
  onChange,
  onRemove,
  disabled,
}: {
  rule: GroupRule;
  attributes: TierAttribute[];
  /** PAD-920: the tiers editor's `tier-side-<tier>` on a group's side rule. */
  operationTestId?: string;
  onChange: (rule: GroupRule) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const attr = attributes.find((a) => a.id === rule.attribute);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={rule.attribute}
        onValueChange={(v) => onChange({ attribute: v, operation: attributes.find((a) => a.id === v)?.operations[0].id ?? "", value: undefined })}
        disabled={disabled}
      >
        <SelectTrigger className="w-[160px] h-7 text-xs">
          <SelectValue placeholder={t("settings.invitationGroups.attribute")} />
        </SelectTrigger>
        <SelectContent>
          {attributes.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-xs">
              {t(a.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {attr && (
        <Select
          value={rule.operation}
          onValueChange={(v) => onChange({ ...rule, operation: v })}
          disabled={disabled}
        >
          <SelectTrigger className="w-[140px] h-7 text-xs" data-testid={operationTestId}>
            <SelectValue placeholder={t("settings.invitationGroups.operation")} />
          </SelectTrigger>
          <SelectContent>
            {attr.operations.map((op) => (
              <SelectItem key={op.id} value={op.id} className="text-xs">
                {t(op.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {attr && attr.valueType === "number" && (
        <input
          type="number"
          min={0}
          value={rule.value ?? ""}
          onChange={(e) => onChange({ ...rule, value: e.target.value === "" ? undefined : Number(e.target.value) })}
          disabled={disabled}
          className="w-16 h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        />
      )}

      {attr && attr.valueType === "percentage" && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={rule.value ?? ""}
            onChange={(e) => onChange({ ...rule, value: e.target.value === "" ? undefined : Number(e.target.value) })}
            disabled={disabled}
            className="w-16 h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      )}

      {attr && attr.valueType === "select" && "valueOptions" in attr && (
        <Select
          value={String(rule.value ?? "")}
          onValueChange={(v) => onChange({ ...rule, value: v })}
          disabled={disabled}
        >
          <SelectTrigger className="w-[120px] h-7 text-xs">
            <SelectValue placeholder={t("settings.invitationGroups.value")} />
          </SelectTrigger>
          <SelectContent>
            {attr.valueOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id} className="text-xs">
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <button
        type="button"
        className="text-muted-foreground hover:text-destructive transition-colors ml-auto"
        onClick={onRemove}
        disabled={disabled}
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {rule.attribute === "side" && <SideBalanceHelp />}
    </div>
  );
}

function GroupCard({
  group,
  index,
  totalGroups,
  attributes,
  tierIndex,
  children,
  onChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  disabled,
}: {
  group: InvitationGroup;
  index: number;
  totalGroups: number;
  attributes: TierAttribute[];
  /** PAD-920: set in the tiers editor (a new-engine coach): the group's tier, `index` + 2. */
  tierIndex?: number;
  /** The tier's own timing pair, under "Por grupo". */
  children?: React.ReactNode;
  onChange: (group: InvitationGroup) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const inTiers = tierIndex !== undefined;
  const sideRuleIdx = group.rules.findIndex((r) => r.attribute === "side");
  const addRule = () => {
    const defaultAttr = attributes[0];
    onChange({
      ...group,
      rules: [
        ...group.rules,
        { attribute: defaultAttr.id, operation: defaultAttr.operations[0].id },
      ],
    });
  };

  const updateRule = (idx: number, rule: GroupRule) => {
    const next = [...group.rules];
    next[idx] = rule;
    onChange({ ...group, rules: next });
  };

  const removeRule = (idx: number) => {
    onChange({ ...group, rules: group.rules.filter((_, i) => i !== idx) });
  };

  return (
    <div
      data-testid={`invitation-group-${index}`}
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={`rounded-lg border p-3 space-y-3 transition-colors ${
        isDragging ? "bg-muted/50 border-primary/30" : "bg-background"
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          disabled={disabled}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium flex-1">{t("settings.invitationGroups.group", { number: index + 1 })}</span>
        {(inTiers || totalGroups > 1) && (
          <button
            type="button"
            data-testid={inTiers ? `tier-remove-${tierIndex}` : undefined}
            className="text-muted-foreground hover:text-destructive transition-colors"
            onClick={onRemove}
            disabled={disabled}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {group.rules.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          {t("settings.invitationGroups.noRules")}
        </p>
      )}

      <div className="space-y-2">
        {group.rules.map((rule, idx) => (
          <RuleRow
            key={idx}
            rule={rule}
            attributes={attributes}
            operationTestId={inTiers && idx === sideRuleIdx ? `tier-side-${tierIndex}` : undefined}
            onChange={(r) => updateRule(idx, r)}
            onRemove={() => removeRule(idx)}
            disabled={disabled}
          />
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={addRule}
        disabled={disabled}
      >
        <Plus className="w-3 h-3" />
        {t("settings.invitationGroups.addRule")}
      </Button>
      {children}
    </div>
  );
}

type TierPair = EngineTimingPair | null;

/** PAD-920 (notifications.config rule 20): what the tiers editor of a coach on the new engine needs. */
export interface TiersEditorEngine {
  method: EngineTimingMethod;
  /** The held `timing.perTier`, tier order; read only with `per_tier`. */
  perTier: TierPair[] | undefined;
  /** What a tier with no pair of its own shows: the card's pair, as displayed. */
  fallback: { betweenRoundsMinutes: number; betweenGroupsMinutes: number };
  /** One change carries the groups and, with `per_tier`, `perTier` kept aligned with them (else undefined). */
  onChange: (groups: InvitationGroup[], perTier: TierPair[] | undefined) => void;
}

interface InvitationGroupsSectionProps {
  groups: InvitationGroup[];
  onChange: (groups: InvitationGroup[]) => void;
  disabled?: boolean;
  /** Set for a coach on the new engine: the editor becomes the tiers editor. Unset, today's editor. */
  engine?: TiersEditorEngine;
}

/** A tier's own pair under "Por grupo": a null entry shows the card's pair until its first step. */
function TierTiming({
  tierIndex,
  entry,
  fallback,
  onChange,
  disabled,
}: {
  tierIndex: number;
  entry: TierPair;
  fallback: TiersEditorEngine["fallback"];
  onChange: (entry: EngineTimingPair) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const rows = [
    ["betweenRoundsMinutes", "between-rounds", "settings.engine.newEngine.betweenRounds"],
    ["betweenGroupsMinutes", "between-groups", "settings.engine.newEngine.betweenGroups"],
  ] as const;
  return (
    <div className="space-y-1.5 border-t pt-2">
      {rows.map(([key, slug, labelKey]) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{t(labelKey)}</span>
          <EngineStepper
            testId={`tier-${tierIndex}-${slug}`}
            boundKey={key}
            value={entry?.[key] ?? fallback[key]}
            unit={t("settings.restrictions.min")}
            onStep={(v) => onChange({ betweenRoundsMinutes: null, betweenGroupsMinutes: null, ...entry, [key]: v })}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * PAD-920 (notifications.config rule 20): the groups editor as a new-engine coach's tiers editor.
 * The coach's list and the students' list come first as tiers 0 and 1 (fixed: no rules, not
 * removable), then the groups as tiers 2…; the side rule also offers "Lado contrário". With
 * "Por grupo" every tier has its own pair, and `perTier` follows the groups through every edit.
 * Test ids are shared with the iOS tiers editor.
 */
function TiersEditor({ groups, engine, disabled }: { groups: InvitationGroup[]; engine: TiersEditorEngine; disabled?: boolean }) {
  const { t } = useTranslation();
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const perTierOn = engine.method === "per_tier";
  const perTier = perTierAligned(engine.perTier, groups.length);
  const emit = (next: InvitationGroup[], nextPerTier: TierPair[]) => engine.onChange(next, perTierOn ? nextPerTier : undefined);

  const handleDragOver = (e: React.DragEvent, overIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === overIdx) return;
    emit(moveTier(groups, dragIdx, overIdx), perTierAfterMove(perTier, dragIdx, overIdx));
    setDragIdx(overIdx);
  };
  const updateGroup = (idx: number, group: InvitationGroup) => {
    const next = [...groups];
    next[idx] = group;
    emit(next, perTier);
  };
  const setPair = (tierIndex: number, entry: EngineTimingPair) => {
    const next = [...perTier];
    next[tierIndex] = entry;
    emit(groups, next);
  };
  const timing = (tierIndex: number) =>
    perTierOn ? (
      <TierTiming
        tierIndex={tierIndex}
        entry={perTier[tierIndex]}
        fallback={engine.fallback}
        onChange={(entry) => setPair(tierIndex, entry)}
        disabled={disabled}
      />
    ) : null;

  const lastGroup = groups[groups.length - 1];

  return (
    <div data-testid="tiers-editor" className={`space-y-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <p className="text-xs text-muted-foreground">{t("settings.invitationGroups.sequenceHint")}</p>

      {FIXED_TIERS.map((tier) => (
        <div key={tier.index} data-testid={`tier-row-${tier.index}`} className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium flex-1 first-letter:uppercase">{t(tier.labelKey)}</p>
            <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {t("settings.engine.newEngine.tiers.fixed")}
            </span>
          </div>
          {timing(tier.index)}
        </div>
      ))}

      {groups.map((group, idx) => {
        const tierIndex = FIXED_TIERS.length + idx;
        return (
          <div key={group.id} data-testid={`tier-row-${tierIndex}`}>
            <GroupCard
              group={group}
              index={idx}
              totalGroups={groups.length}
              attributes={NEW_ENGINE_ATTRIBUTES}
              tierIndex={tierIndex}
              onChange={(g) => updateGroup(idx, g)}
              onRemove={() => emit(groups.filter((_, i) => i !== idx), perTierAfterRemove(perTier, idx))}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={() => setDragIdx(null)}
              isDragging={dragIdx === idx}
              disabled={disabled}
            >
              {timing(tierIndex)}
            </GroupCard>
          </div>
        );
      })}

      {lastGroup && lastGroup.rules.length > 0 && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">{t("settings.invitationGroups.lastGroupHint")}</p>
      )}

      {groups.length < MAX_TIERS && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1 w-full"
          data-testid="tier-add"
          onClick={() => emit([...groups, { id: String(Date.now()), rules: [] }], [...perTier, null])}
          disabled={disabled}
        >
          <Plus className="w-3.5 h-3.5" />
          {t("settings.invitationGroups.addGroup")}
        </Button>
      )}
    </div>
  );
}

export function InvitationGroupsSection({ engine, ...props }: InvitationGroupsSectionProps) {
  if (engine) return <TiersEditor groups={props.groups} engine={engine} disabled={props.disabled} />;
  return <OldEngineGroupsEditor {...props} />;
}

function OldEngineGroupsEditor({ groups, onChange, disabled }: Omit<InvitationGroupsSectionProps, "engine">) {
  const { t } = useTranslation();
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent, overIdx: number) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === overIdx) return;
      const next = [...groups];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      onChange(next);
      setDragIdx(overIdx);
    },
    [dragIdx, groups, onChange]
  );

  const addGroup = () => {
    const nextId = String(Date.now());
    onChange([...groups, { id: nextId, rules: [] }]);
  };

  const removeGroup = (idx: number) => {
    onChange(groups.filter((_, i) => i !== idx));
  };

  const updateGroup = (idx: number, group: InvitationGroup) => {
    const next = [...groups];
    next[idx] = group;
    onChange(next);
  };

  const lastGroup = groups[groups.length - 1];
  const showLastGroupHint = lastGroup && lastGroup.rules.length > 0;

  return (
    <div className={`space-y-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      <p className="text-xs text-muted-foreground">
        {t("settings.invitationGroups.sequenceHint")}
      </p>

      {groups.map((group, idx) => (
        <GroupCard
          key={group.id}
          group={group}
          index={idx}
          totalGroups={groups.length}
          attributes={OLD_ENGINE_ATTRIBUTES}
          onChange={(g) => updateGroup(idx, g)}
          onRemove={() => removeGroup(idx)}
          onDragStart={() => setDragIdx(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragEnd={() => setDragIdx(null)}
          isDragging={dragIdx === idx}
          disabled={disabled}
        />
      ))}

      {showLastGroupHint && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          {t("settings.invitationGroups.lastGroupHint")}
        </p>
      )}

      {groups.length < 10 && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1 w-full"
          onClick={addGroup}
          disabled={disabled}
        >
          <Plus className="w-3.5 h-3.5" />
          {t("settings.invitationGroups.addGroup")}
        </Button>
      )}
    </div>
  );
}
