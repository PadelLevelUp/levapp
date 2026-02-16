export const createEventSource = (token: string) =>
  new EventSource(`/api/app/events?token=${token}`);
