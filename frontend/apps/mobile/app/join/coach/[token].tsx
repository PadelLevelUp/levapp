import { useLocalSearchParams } from "expo-router";
import { JoinCoachScreen } from "@/features/players/JoinCoachScreen";

/**
 * Universal-link landing for `https://<domain>/join/coach/:token`
 * (players.join-token rule 3). As with `/invite/*` (PAD-184), the file path IS
 * the linking config; it must match the `paths` entry served in the
 * apple-app-site-association on the VM.
 */
export default function JoinCoachRoute() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  const raw = Array.isArray(token) ? token[0] : token;
  const valid = raw && /^[A-Za-z0-9_-]{16,}$/.test(raw) ? raw : null;
  return <JoinCoachScreen token={valid} />;
}
