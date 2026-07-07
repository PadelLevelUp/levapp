import { api } from "@/api/client";

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
  const res = await api.get("/editor/models");
  return res.data;
}

export async function getEditorSchema(model: string): Promise<FieldDef[]> {
  const res = await api.get(`/editor/${model}/schema`);
  return res.data;
}

export async function getEditorRecords(
  model: string,
  page: number,
  search?: string
): Promise<PaginatedRecords> {
  const res = await api.get(`/editor/${model}`, {
    params: { page, search: search || undefined },
  });
  return res.data;
}

export async function getEditorRecord(
  model: string,
  id: string | number
): Promise<RecordData> {
  const res = await api.get(`/editor/${model}/${id}`);
  return res.data;
}

export async function getEditorOptions(model: string): Promise<RelatedOption[]> {
  const res = await api.get(`/editor/${model}/options`);
  return res.data;
}

export async function createEditorRecord(
  model: string,
  values: RecordData
): Promise<{ id: number }> {
  const res = await api.post(`/editor/${model}`, { values });
  return res.data;
}

export async function updateEditorRecord(
  model: string,
  id: string | number,
  values: RecordData
): Promise<void> {
  await api.patch(`/editor/${model}/${id}`, { values });
}

export async function deleteEditorRecord(
  model: string,
  id: string | number
): Promise<void> {
  await api.delete(`/editor/${model}/${id}`);
}
