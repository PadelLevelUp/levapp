import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GroupRule } from "@/types";
import {
  ELIGIBILITY_ATTRIBUTES,
  WITHIN_N_DIRECTIONS,
  eligibilityNeedsValue as needsValue,
  isRuleBlank,
  isWithinNOperation,
  menuOperation,
  operationForMenuPick,
  withinNDirection,
  withinNOperation,
  type WithinNDirection,
} from "@levelup/config";

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
 *    payment — PAD-132 relabelled them "Account status" / "Exclude inactive
 *    accounts" (ids kept). The eligibility picker simply does not offer them
 *    (eligibility.rules rule 5).
 *  - **level operations are anchored to the CLASS**, not to a vacancy, because
 *    the bar must be answerable for a class with no spot open.
 *  - **"within N levels" has a direction** (PAD-481): one menu entry, plus a
 *    selector beside N for both / only above / only below. The direction is the
 *    stored operation (`within_n_of_class` / `_above_` / `_below_`), mapped by
 *    `@levelup/config`'s level-direction module, shared with iOS.
 *  - **the attribute table and "needs a value"** live in `@levelup/config`
 *    (rule-values), shared with iOS (eligibility.rules rule 13).
 */
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
  // eligibility.rules rule 13: a rule that needs a value and has none is marked where it stands.
  const valueMissing = isRuleBlank(rule, "bar");

  return (
    <div
      className="flex items-center gap-2 flex-wrap"
      data-testid="eligibility-rule-row"
      data-value-missing={valueMissing ? "true" : undefined}
    >
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
          value={menuOperation(rule.operation)}
          onValueChange={(v) => {
            const operation = operationForMenuPick(rule.operation, v);
            onChange({
              ...rule,
              operation,
              // Drop a stale value when switching to an operation that has none.
              value: needsValue(attr, operation) ? rule.value : undefined,
            });
          }}
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

      {attr?.id === "level" && isWithinNOperation(rule.operation) && (
        <Select
          value={withinNDirection(rule.operation) ?? "both"}
          onValueChange={(d) => onChange({ ...rule, operation: withinNOperation(d as WithinNDirection) })}
          disabled={disabled}
        >
          <SelectTrigger
            className="w-[150px] h-7 text-xs"
            aria-label={t("settings.eligibility.direction")}
            data-testid="eligibility-direction"
          >
            <SelectValue placeholder={t("settings.eligibility.direction")} />
          </SelectTrigger>
          <SelectContent>
            {WITHIN_N_DIRECTIONS.map((d) => (
              <SelectItem key={d} value={d} className="text-xs" data-testid={`eligibility-direction-${d}`}>
                {t(`settings.eligibility.directions.${d}`)}
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
      {valueMissing && (
        <p className="basis-full text-xs text-destructive" data-testid="eligibility-value-missing">
          {t("settings.eligibility.valueMissing")}
        </p>
      )}
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
