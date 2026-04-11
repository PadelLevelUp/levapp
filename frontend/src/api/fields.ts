import { api } from "./client";

export async function checkFieldAvailable(
  model: string,
  field: string,
  value: string,
): Promise<string | null> {
  try {
    await api.post("/app/check_field_available", { model, field, value });
    return null;
  } catch (err: any) {
    if (err?.response?.status === 409) {
      return err.response.data.message;
    }
    return null;
  }
}
