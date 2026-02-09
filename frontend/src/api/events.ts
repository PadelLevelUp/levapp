import { API_BASE_URL } from "@/config";

export const createEventSource = (token: string) =>
  new EventSource(`/api/app/events?token=${token}`);
