/**
 * settings.explicit-save (PAD-506): a test stand-in for the Settings screen's one "Guardar alterações"
 * (app/settings.tsx). Mounted beside a section under an `UnsavedRegistryProvider`, it renders a
 * pressable with the given test id that runs every unsaved section's saver in turn, as the screen
 * does, and swallows a failure (the section stays unsaved — what the tests assert).
 */
import { createElement } from "react";
import { Pressable } from "react-native";
import { useUnsavedRegistry } from "@/features/settings/unsaved-registry";

export function SectionSaveProbe({ testID }: { testID: string }) {
  const registry = useUnsavedRegistry();
  const save = async () => {
    for (const key of registry.unsavedKeys()) {
      try {
        await registry.saverFor(key)?.save();
      } catch {
        // stays unsaved
      }
    }
  };
  return createElement(Pressable, { testID, onPress: () => void save() });
}
