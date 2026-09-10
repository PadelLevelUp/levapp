import { getApi } from "../client";

/**
 * settings.admin-editor (PAD-175): the LevApp superadmin's data browser API
 * (`/api/editor/*`). Web-only by design (rule 7); every route is superadmin-only
 * server-side and secret columns never come back (rule 3).
 */

export type FieldDef = {
  type: string;
  label: string;
  name: string;
  options: string[] | null;
  required: boolean;
  related_model: string | null;
};

export type ModelMeta = {
  key: string;
  title: string;
  searchableColumn: { field: string; label: string } | null;
  listColumns: { field: string; label: string }[];
};

export type RelatedOption = { id: number; label: string };
export type RecordData = Record<string, unknown>;

export type PaginatedRecords = {
  items: RecordData[];
  total: number;
  pages: number;
  page: number;
};

export async function getEditorModels(): Promise<ModelMeta[]> {
  const res = await getApi().get("/editor/models");
  return res.data;
}

export async function getEditorSchema(model: string): Promise<FieldDef[]> {
  const res = await getApi().get(`/editor/${model}/schema`);
  return res.data;
}

export async function getEditorRecords(
  model: string,
  page: number,
  search?: string
): Promise<PaginatedRecords> {
  const res = await getApi().get(`/editor/${model}`, {
    params: { page, search: search || undefined },
  });
  return res.data;
}

export async function getEditorRecord(
  model: string,
  id: string | number
): Promise<RecordData> {
  const res = await getApi().get(`/editor/${model}/${id}`);
  return res.data;
}

export async function getEditorOptions(model: string): Promise<RelatedOption[]> {
  const res = await getApi().get(`/editor/${model}/options`);
  return res.data;
}

export async function createEditorRecord(
  model: string,
  values: RecordData
): Promise<{ id: number }> {
  const res = await getApi().post(`/editor/${model}`, { values });
  return res.data;
}

export async function updateEditorRecord(
  model: string,
  id: string | number,
  values: RecordData
): Promise<void> {
  await getApi().patch(`/editor/${model}/${id}`, { values });
}

export async function deleteEditorRecord(
  model: string,
  id: string | number
): Promise<void> {
  await getApi().delete(`/editor/${model}/${id}`);
}
