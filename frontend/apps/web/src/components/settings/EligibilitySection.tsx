import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GroupRule } from "@/types";

/**
 * PAD-128 — the coach's standard eligibility bar.
 *
 * Reuses the InvitationGroupsSection rule-builder SHAPE (attribute / operation
 * / value) but deliberately NOT its attribute list:
 *
 *  - **no side.** Side stays a wave criterion inside the invitation engine — it
 *    decides who is asked first, never who is allowed in (eligibility.rules
 *    rule 4).
 *  - **no payments/subscription.** No payment state exists to read; the
 *    existing `subscription_status` invitation-group attribute and the
 *    `excludeUnpaidSubscription` restriction both read account activation, not
 *    payment. Both keep working untouched; the eligibility picker simply does
 *    not offer them (eligibility.rules rule 5).
 *  - **level operations are anchored to the CLASS**, not to a vacancy, because
 *    the bar must be answerable for a class with no spot open.
 */
const ELIGIBILITY_ATTRIBUTES = [
  {
    id: "level",
    labelKey: "settings.eligibility.attributes.level",
    operations: [
      { id: "same_as_class", labelKey: "settings.eligibility.operations.sameAsClass" },
      { id: "equal_or_above_class", labelKey: "settings.eligibility.operations.equalOrAboveClass" },
      { id: "equal_or_below_class", labelKey: "settings.eligibility.operations.equalOrBelowClass" },
      { id: "one_below_or_above_class", labelKey: "settings.eligibility.operations.oneBelowOrAboveClass" },
      { id: "within_n_of_class", labelKey: "settings.eligibility.operations.withinNOfClass" },
    ],
    // `within_n_of_class` is the only level operation that carries a value.
    valueType: "conditional-number" as const,
    valueForOperations: ["within_n_of_class"],
  },
  {
    id: "unjustified_absences",
    labelKey: "settings.eligibility.attributes.unjustifiedAbsences",
    operations: [
      { id: "less_than", labelKey: "settings.eligibility.operations.lessThan" },
      { id: "equals", labelKey: "settings.eligibility.operations.equals" },
      { id: "less_than_or_equal", labelKey: "settings.eligibility.operations.atMost" },
    ],
    valueType: "number" as const,
  },
  {
    id: "justified_absences",
    labelKey: "settings.eligibility.attributes.justifiedAbsences",
    operations: [
      { id: "less_than", labelKey: "settings.eligibility.operations.lessThan" },
      { id: "equals", labelKey: "settings.eligibility.operations.equals" },
      { id: "less_than_or_equal", labelKey: "settings.eligibility.operations.atMost" },
    ],
    valueType: "number" as const,
  },
  {
    id: "attendance_rate",
    labelKey: "settings.eligibility.attributes.attendanceRate",
    operations: [
      { id: "greater_than", labelKey: "settings.eligibility.operations.greaterThan" },
      { id: "greater_than_or_equal", labelKey: "settings.eligibility.operations.atLeast" },
    ],
    valueType: "percentage" as const,
  },
];

function needsValue(attr: (typeof ELIGIBILITY_ATTRIBUTES)[number], operation: string): boolean {
  if (attr.valueType === "number" || attr.valueType === "percentage") return true;
  if (attr.valueType === "conditional-number") {
    return (attr.valueForOperations ?? []).includes(operation);
  }
  return false;
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
  const attr = ELIGIBILITY_ATTRIBUTES.find((a) => a.id === rule.attribute);
  const showValue = attr ? needsValue(attr, rule.operation) : false;
  const isPercentage = attr?.valueType === "percentage";

  return (
    <div className="flex items-center gap-2 flex-wrap" data-testid="eligibility-rule-row">
      <Select
        value={rule.attribute}
        onValueChange={(v) => {
          const next = ELIGIBILITY_ATTRIBUTES.find((a) => a.id === v);
          onChange({
            attribute: v,
            operation: next?.operations[0].id ?? "",
            value: undefined,
          });
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-[180px] h-7 text-xs" aria-label={t("settings.eligibility.attribute")}>
          <SelectValue placeholder={t("settings.eligibility.attribute")} />
        </SelectTrigger>
        <SelectContent>
          {ELIGIBILITY_ATTRIBUTES.map((a) => (
            <SelectItem key={a.id} value={a.id} className="text-xs">
              {t(a.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {attr && (
        <Select
          value={rule.operation}
          onValueChange={(v) =>
            onChange({
              ...rule,
              operation: v,
              // Drop a stale value when switching to an operation that has none.
              value: needsValue(attr, v) ? rule.value : undefined,
            })
          }
          disabled={disabled}
        >
          <SelectTrigger className="w-[170px] h-7 text-xs" aria-label={t("settings.eligibility.operation")}>
            <SelectValue placeholder={t("settings.eligibility.operation")} />
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

      {showValue && (
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={isPercentage ? 100 : undefined}
            value={rule.value ?? ""}
            onChange={(e) =>
              onChange({
                ...rule,
                value: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            disabled={disabled}
            aria-label={t("settings.eligibility.value")}
            className="w-16 h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          />
          {isPercentage && <span className="text-xs text-muted-foreground">%</span>}
        </div>
      )}

      <button
        type="button"
        className="text-muted-foreground hover:text-destructive transition-colors ml-auto"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t("settings.eligibility.removeRule")}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

interface EligibilitySectionProps {
  /** `null`/`undefined` means no bar is defined — everyone is eligible. */
  rules: GroupRule[] | null | undefined;
  onChange: (rules: GroupRule[] | null) => void;
  disabled?: boolean;
}

export function EligibilitySection({ rules, onChange, disabled }: EligibilitySectionProps) {
  const { t } = useTranslation();
  const current = rules ?? [];
  const hasBar = current.length > 0;

  const addRule = () => {
    const defaultAttr = ELIGIBILITY_ATTRIBUTES[0];
    onChange([
      ...current,
      { attribute: defaultAttr.id, operation: defaultAttr.operations[0].id },
    ]);
  };

  const updateRule = (idx: number, rule: GroupRule) => {
    const next = [...current];
    next[idx] = rule;
    onChange(next);
  };

  const removeRule = (idx: number) => {
    const next = current.filter((_, i) => i !== idx);
    // Clearing the last rule returns the bar to "unset" rather than leaving an
    // empty array behind — at the coach tier the two are equivalent, and null
    // is the honest representation of "I have not defined a bar".
    onChange(next.length === 0 ? null : next);
  };

  return (
    <div
      className={`space-y-3 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
      data-testid="eligibility-section"
    >
      <p className="text-xs text-muted-foreground">{t("settings.eligibility.hint")}</p>

      {!hasBar && (
        <p
          className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2"
          data-testid="eligibility-open-bar"
        >
          {t("settings.eligibility.noBar")}
        </p>
      )}

      {hasBar && (
        <div className="rounded-lg border p-3 space-y-2 bg-background">
          {current.map((rule, idx) => (
            <RuleRow
              key={idx}
              rule={rule}
              onChange={(r) => updateRule(idx, r)}
              onRemove={() => removeRule(idx)}
              disabled={disabled}
            />
          ))}
          <p className="text-xs text-muted-foreground pt-1">
            {t("settings.eligibility.allRulesApply")}
          </p>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="gap-1 w-full"
        onClick={addRule}
        disabled={disabled}
      >
        <Plus className="w-3.5 h-3.5" />
        {t("settings.eligibility.addRule")}
      </Button>
    </div>
  );
}
