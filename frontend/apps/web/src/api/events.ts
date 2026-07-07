import { buildEventsUrl } from "@levelup/api";

export const createEventSource = (token: string) =>
  new EventSource(buildEventsUrl("/api", token));
