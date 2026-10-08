import { getApi } from "../client";

/** notifications.message-templates rule 19 (PAD-549): one example value per placeholder. */
export type TemplateExamples = Record<string, string>;

/**
 * The template rendered by the server's real formatter with example values (a sample class
 * tomorrow at 18:00), plus each example — so the settings help never drifts from what is sent.
 */
export async function previewTemplate(template: string): Promise<{ text: string; examples: TemplateExamples }> {
  const res = await getApi().post("/app/notify/template_preview", { template });
  return res.data;
}
