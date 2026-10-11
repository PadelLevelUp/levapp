import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";

/**
 * auth.social-sign-in rule 7 (PAD-618): the iOS provider buttons. Google and Apple are offered
 * TOGETHER or not at all (App Store Guideline 4.8), and only where the build carries the Google
 * iOS client id, so every provider ships dark.
 */

/** The reversed-client-id-free redirect Google's iOS OAuth client uses: the bundle id scheme. */
export const GOOGLE_IOS_REDIRECT_URI = "com.padellevelup.app:/oauth2redirect/google";

export function googleIosClientId(): string | null {
  const id = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  return id ? id : null;
}

/** Both providers or neither: iOS, a Google client id, and Sign in with Apple on this device. */
export async function socialProvidersEnabled(): Promise<boolean> {
  if (Platform.OS !== "ios" || googleIosClientId() === null) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fresh raw nonce (hex) and its SHA-256: Apple gets the hash, our server gets the raw value. */
export async function newAppleNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = toHex(await Crypto.getRandomBytesAsync(32));
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/** Apple's cancel is not an error (the sheet was dismissed). */
export function isAppleCancel(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "ERR_REQUEST_CANCELED";
}

type ErrorResponse = { status?: number; data?: { error?: string } };

/** The copy key for a failed provider exchange, mirroring web's GoogleSignInButton (rule 3 refusals). */
export function socialErrorKey(err: unknown): {
  key: "errorUnavailable" | "errorEmailUnverified" | "errorCoachRejected" | "errorDisabled" | "errorInvalid" | "errorNetwork";
  shared: boolean;
} {
  const response = (err as { response?: ErrorResponse } | null)?.response;
  const status = response?.status;
  const code = response?.data?.error;
  if (status === 503) return { key: "errorUnavailable", shared: false };
  if (code === "ACCOUNT_EMAIL_UNVERIFIED") return { key: "errorEmailUnverified", shared: false };
  if (code === "COACH_REJECTED") return { key: "errorCoachRejected", shared: true };
  if (code === "ACCOUNT_DISABLED") return { key: "errorDisabled", shared: true };
  return status ? { key: "errorInvalid", shared: false } : { key: "errorNetwork", shared: false };
}
