import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";

import { previewTemplate, type TemplateExamples } from "@/api/templatePreview";

/** Every placeholder a template can hold, in the order the help lists them (rule 3, PAD-549). */
export const ALL_PLACEHOLDERS = ["name", "level", "weekday", "time", "day", "date", "type", "court", "class", "when", "side"];

/**
 * PAD-549 (notifications.message-templates rule 19): how a template is built — free text plus
 * fields replaced when the message is sent — and every field with what it means and an example.
 * The examples come from the server's own formatters, in the coach's language.
 */
export function TemplateHelp() {
  const { t } = useTranslation();
  const [examples, setExamples] = useState<TemplateExamples | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => previewTemplate(""))
      .then((res) => {
        if (!cancelled) setExamples(res.examples);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <details className="rounded-lg border bg-muted/30 p-3 text-sm" data-testid="template-help" open>
      <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
        <HelpCircle className="h-4 w-4 text-muted-foreground" />
        {t("settings.templates.help.title")}
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-muted-foreground">{t("settings.templates.help.intro")}</p>
        <p className="text-muted-foreground">{t("settings.templates.help.howTo")}</p>
        <table className="w-full text-xs" data-testid="template-help-fields">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">{t("settings.templates.help.field")}</th>
              <th className="py-1 pr-2 font-medium">{t("settings.templates.help.meaning")}</th>
              <th className="py-1 font-medium">{t("settings.templates.help.example")}</th>
            </tr>
          </thead>
          <tbody>
            {ALL_PLACEHOLDERS.map((key) => (
              <tr key={key} className="border-t align-top" data-testid={`template-help-field-${key}`}>
                <td className="py-1 pr-2 font-mono">{`{${key}}`}</td>
                <td className="py-1 pr-2">{t(`settings.templates.help.fields.${key}`)}</td>
                <td className="py-1" data-testid={`template-help-example-${key}`}>
                  {examples ? (examples[key] || "—") : "…"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * PAD-549: the live preview of one template, rendered by the server's formatter with the example
 * values. Debounced; silent when the server cannot answer, so the editor never blocks on it.
 */
export function TemplatePreview({ template, templateKey }: { template: string; templateKey: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!template.trim()) {
      setText(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => previewTemplate(template))
        .then((res) => {
          if (!cancelled) setText(res.text);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [template]);

  if (!text) return null;
  return (
    <p className="text-xs text-muted-foreground" data-testid={`template-preview-${templateKey}`}>
      <span className="font-medium">{t("settings.templates.help.preview")}</span> {text}
    </p>
  );
}
