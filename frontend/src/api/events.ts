export const createEventSource = (token: string) =>
  new EventSource(`/app/events?token=${token}`);
