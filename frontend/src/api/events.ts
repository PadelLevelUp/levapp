import { API_BASE_URL } from "@/config";

export const createEventSource = (token: string) =>
  new EventSource(`${API_BASE_URL}/api/app/events?token=${token}`);
