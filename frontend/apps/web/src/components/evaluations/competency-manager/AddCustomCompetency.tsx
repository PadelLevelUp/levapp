import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { evaluationApiErrorCode, useCreateCustomCompetency } from "@levelup/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddCustomCompetencyProps {
  /** PAD-431 (rule 15): add a sub-category of this category; absent, a new category. */
  parentId?: number;
  /** The section the field belongs to, for its test ids (`competency-add-sub-<section>-…`). */
  sectionId?: string;
}

/**
 * A new category, or a sub-category of one (evaluations.competencies rules 6, 15). The server
 * trims and decides: 409 `duplicate_name` and 400 `name_invalid` are shown on the field, and what
 * the coach typed stays there to be corrected.
 */
export function AddCustomCompetency({ parentId, sectionId }: AddCustomCompetencyProps = {}) {
  const { t } = useTranslation();
  const create = useCreateCustomCompetency();
  const [name, setName] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const sub = parentId !== undefined;
  const testId = sub ? `competency-add-sub-${sectionId}` : "competency-add";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
    <form onSubmit={(event) => void submit(event)} className={sub ? "space-y-1 pl-6" : "space-y-2"} data-testid={testId}>
      <Label htmlFor={`${testId}-name`} className={sub ? "text-xs text-muted-foreground" : undefined}>
        {t(sub ? "evaluations.manager.subTitle" : "evaluations.manager.customTitle")}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`${testId}-name`}
          data-testid={`${testId}-name`}
          value={name}
          maxLength={100}
          placeholder={t(sub ? "evaluations.manager.subNamePlaceholder" : "evaluations.manager.namePlaceholder")}
          aria-invalid={errorKey ? true : undefined}
          aria-describedby={errorKey ? `${testId}-error` : undefined}
          onChange={(e) => { setName(e.target.value); setErrorKey(null); }}
        />
        <Button type="submit" size={sub ? "sm" : "default"} data-testid={`${testId}-submit`} disabled={create.isPending}>
          {t("evaluations.manager.add")}
        </Button>
      </div>
      {errorKey ? (
        <p id={`${testId}-error`} data-testid={`${testId}-error`} role="alert" className="text-xs text-destructive">
          {t(`evaluations.manager.${errorKey}`)}
        </p>
      ) : null}
    </form>
  );
}
