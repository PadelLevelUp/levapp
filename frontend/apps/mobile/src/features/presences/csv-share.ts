import { File, Paths } from "expo-file-system";
import { Share } from "react-native";

/**
 * PAD-166 — hands a CSV to the iOS share sheet.
 *
 * Web downloads a Blob through an `<a download>`; iOS has no download folder,
 * so the equivalent gesture is the share sheet: Save to Files, Mail, AirDrop,
 * Numbers. The file has to exist on disk first — a share sheet attaches a
 * `file://` URL, it cannot be handed a string and asked to name it.
 *
 * **No new native module.** `expo-sharing` was the obvious candidate and is
 * deliberately not used: React Native's own `Share` already presents
 * `UIActivityViewController` with a file URL on iOS, and `expo-file-system` is
 * already a dependency the shipped binary links (`src/lib/api.ts` imports it at
 * startup). Adding `expo-sharing` would have forced a native rebuild for a
 * capability the binary already has — the same trade
 * `app/player/[playerId].tsx` records when it reaches for RN's `Share` instead.
 *
 * The file goes in the cache directory, not documents: once the coach has sent
 * it somewhere it is a copy, and iOS is free to reclaim it. Re-exporting the
 * same day overwrites rather than accumulating `presences-1.csv`.
 *
 * @returns `true` when the coach sent the file somewhere, `false` when they
 *          dismissed the sheet. Throws only if writing or presenting failed,
 *          which is what the caller surfaces as an error.
 */
export async function sharePresencesCsv({
  csv,
  fileName,
  title,
}: {
  csv: string;
  fileName: string;
  title: string;
}): Promise<boolean> {
  const file = new File(Paths.cache, fileName);
  // `create` throws when the file is already there unless told otherwise, and
  // a coach exporting twice in one day is normal, not an error.
  file.create({ overwrite: true, intermediates: true });
  file.write(csv);

  // `url`, not `message`: `message` would paste the CSV *text* into Mail's
  // body, which is not a spreadsheet and cannot be opened in Numbers. On iOS
  // `url` is the attachment.
  const result = await Share.share({ url: file.uri, title }, { subject: title });
  return result.action !== Share.dismissedAction;
}
