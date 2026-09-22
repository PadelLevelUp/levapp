import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { evaluationApiErrorCode, useCreateCustomCompetency } from "@levelup/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Competência personalizada" (evaluations.competencies rule 6). The server trims and
 * decides: 409 `duplicate_name` and 400 `name_invalid` are shown on the field, and what
 * the coach typed stays there to be corrected.
 */
export function AddCustomCompetency() {
  const { t } = useTranslation();
  const create = useCreateCustomCompetency();
  const [name, setName] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
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
    <form onSubmit={(event) => void submit(event)} className="space-y-2" data-testid="competency-add">
      <Label htmlFor="competency-add-name">{t("evaluations.manager.customTitle")}</Label>
      <div className="flex items-center gap-2">
        <Input
          id="competency-add-name"
          data-testid="competency-add-name"
          value={name}
          maxLength={100}
          placeholder={t("evaluations.manager.namePlaceholder")}
          aria-invalid={errorKey ? true : undefined}
          aria-describedby={errorKey ? "competency-add-error" : undefined}
          onChange={(e) => { setName(e.target.value); setErrorKey(null); }}
        />
        <Button type="submit" data-testid="competency-add-submit" disabled={create.isPending}>
          {t("evaluations.manager.add")}
        </Button>
      </div>
      {errorKey ? (
        <p id="competency-add-error" data-testid="competency-add-error" role="alert" className="text-xs text-destructive">
          {t(`evaluations.manager.${errorKey}`)}
        </p>
      ) : null}
    </form>
  );
}
