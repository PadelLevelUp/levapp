/**
 * settings.explicit-save (PAD-506): a test stand-in for the Settings screen's one "Guardar alterações"
 * (app/settings.tsx). Mounted beside a section under an `UnsavedRegistryProvider`, it renders a
 * pressable with the given test id that runs every unsaved section's saver in turn, as the screen
 * does, and swallows a failure (the section stays unsaved — what the tests assert). The failed parts
 * are shown as the screen's toast names them (`failedPartText`), under `<testID>-failed`.
 */
import { createElement, Fragment, useState } from "react";
import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";
import { failedPartText, useUnsavedRegistry } from "@/features/settings/unsaved-registry";

export function SectionSaveProbe({ testID }: { testID: string }) {
  const registry = useUnsavedRegistry();
  const [failed, setFailed] = useState<string[]>([]);
  const save = async () => {
    const parts: string[] = [];
    for (const key of registry.unsavedKeys()) {
      const saver = registry.saverFor(key);
      if (!saver) continue;
      try {
        await saver.save();
      } catch (error) {
        // stays unsaved
        parts.push(failedPartText(saver.label, error));
      }
    }
    setFailed(parts);
  };
  return createElement(
    Fragment,
    null,
    createElement(Pressable, { testID, onPress: () => void save() }),
    createElement(Text, { testID: `${testID}-failed` }, failed.join(", ")),
  );
}
