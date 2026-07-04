import { useCallback, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InvitationGroup, GroupRule } from "@/types";

const AVAILABLE_ATTRIBUTES = [
  {
    id: "level",
    label: "Level",
    operations: [
      { id: "same_as_vacancy", label: "Same as vacancy" },
      { id: "one_above_vacancy", label: "One level above vacancy" },
      { id: "one_below_vacancy", label: "One level below vacancy" },
      { id: "all_above_vacancy", label: "All levels above vacancy" },
      { id: "all_below_vacancy", label: "All levels below vacancy" },
    ],
    valueType: "none" as const,
  },
  {
    id: "side",
    label: "Playing side",
    operations: [
      { id: "same_as_vacancy", label: "Same as vacancy" },
    ],
    valueType: "none" as const,
  },
  {
    id: "has_makeups",
    label: "Aula por repor",
    operations: [
      { id: "is_true", label: "Has pending makeup" },
    ],
    valueType: "none" as const,
  },
  {
    id: "unjustified_absences",
    label: "Unjustified absences",
    operations: [
      { id: "less_than", label: "Less than" },
      { id: "equals", label: "Equals" },
      { id: "less_than_or_equal", label: "At most" },
    ],
    valueType: "number" as const,
  },
  {
    id: "justified_absences",
    label: "Justified absences",
    operations: [
      { id: "less_than", label: "Less than" },
      { id: "equals", label: "Equals" },
      { id: "less_than_or_equal", label: "At most" },
    ],
    valueType: "number" as const,
  },
  {
    id: "attendance_rate",
    label: "Attendance rate",
    operations: [
      { id: "greater_than", label: "Greater than" },
      { id: "greater_than_or_equal", label: "At least" },
    ],
    valueType: "percentage" as const,
  },
  {
    id: "subscription_status",
    label: "Subscription",
    operations: [
      { id: "equals", label: "Is" },
    ],
    valueType: "select" as const,
    valueOptions: [
      { id: "active", label: "Active" },
      { id: "inactive", label: "Inactive" },
    ],
  },
];

export const DEFAULT_INVITATION_GROUPS: InvitationGroup[] = [
  {
    id: "default_1",
    rules: [
      { attribute: "level", operation: "one_above_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "default_2",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "default_3",
    rules: [
      { attribute: "level", operation: "one_above_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
    ],
  },
  {
    id: "default_4",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
      { attribute: "side", operation: "same_as_vacancy" },
    ],
  },
  {
    id: "default_5",
    rules: [
      { attribute: "level", operation: "one_above_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "default_6",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
      { attribute: "has_makeups", operation: "is_true" },
    ],
  },
  {
    id: "default_7",
    rules: [
      { attribute: "level", operation: "one_above_vacancy" },
    ],
  },
  {
    id: "default_8",
    rules: [
      { attribute: "level", operation: "same_as_vacancy" },
    ],
  },
];

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
  const attr = AVAILABLE_ATTRIBUTES.find((a) => a.id === rule.attribute);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select
        value={rule.attribute}
        onValueChange={(v) => onChange({ attribute: v, operation: AVAILABLE_ATTRIBUTES.find((a) => a.id === v)?.operations[0].id ?? "", value: undefined })}
        disabled={disabled}
      >
        <SelectTrigger className="w-[160px] h-7 text-xs">
          <SelectValue placeholder="Attribute" />
        </SelectTrigger>
        <SelectContent>
          {AVAILABLE_ATTRIBUTES.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-xs">
              {a.label}
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
          <SelectTrigger className="w-[140px] h-7 text-xs">
            <SelectValue placeholder="Operation" />
          </SelectTrigger>
          <SelectContent>
            {attr.operations.map((op) => (
              <SelectItem key={op.id} value={op.id} className="text-xs">
                {op.label}
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
            <SelectValue placeholder="Value" />
          </SelectTrigger>
          <SelectContent>
            {attr.valueOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id} className="text-xs">
                {opt.label}
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
    </div>
  );
}

function GroupCard({
  group,
  index,
  totalGroups,
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
  onChange: (group: InvitationGroup) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  disabled?: boolean;
}) {
  const addRule = () => {
    const defaultAttr = AVAILABLE_ATTRIBUTES[0];
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
        <span className="text-sm font-medium flex-1">Group {index + 1}</span>
        {totalGroups > 1 && (
          <button
            type="button"
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
          No rules — open to all players.
        </p>
      )}

      <div className="space-y-2">
        {group.rules.map((rule, idx) => (
          <RuleRow
            key={idx}
            rule={rule}
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
        Add rule
      </Button>
    </div>
  );
}

interface InvitationGroupsSectionProps {
  groups: InvitationGroup[];
  onChange: (groups: InvitationGroup[]) => void;
  disabled?: boolean;
}

export function InvitationGroupsSection({ groups, onChange, disabled }: InvitationGroupsSectionProps) {
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
        Groups are tried in sequence. If no one in Group 1 accepts, the system moves to Group 2, and so on.
      </p>

      {groups.map((group, idx) => (
        <GroupCard
          key={group.id}
          group={group}
          index={idx}
          totalGroups={groups.length}
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
          Tip: Your last group has filters. Add an empty group at the end to allow any player as a last resort.
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
          Add group
        </Button>
      )}
    </div>
  );
}
