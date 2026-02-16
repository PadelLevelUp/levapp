type Listener = (count: number) => void;

let currentUnread = 0;
let listener: Listener | null = null;

export function setUnreadListener(fn: Listener) {
  listener = fn;
  fn(currentUnread);
}

export function clearUnreadListener(fn: Listener) {
  if (listener === fn) listener = null;
}

export function updateUnreadCount(count: number) {
  currentUnread = count;
  listener?.(count);
}
