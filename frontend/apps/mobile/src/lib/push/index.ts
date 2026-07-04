import { ExpoPushRegistrar } from "./expoPushRegistrar";
import type { PushRegistrar } from "./types";

let instance: PushRegistrar | null = null;

/** Singleton factory so the app has one registrar (and one token flow). */
export function getPushRegistrar(): PushRegistrar {
  if (!instance) {
    instance = new ExpoPushRegistrar();
  }
  return instance;
}

export { PUSH_TOKEN_ENDPOINT } from "./expoPushRegistrar";
export type { PushRegistrar } from "./types";
