import * as React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { COUNTRIES, countryName } from "@levelup/config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";

/**
 * PAD-604: the country picker on the completion forms, as sign-up's (`app/signup.tsx`): required,
 * default PT, the `COUNTRIES` list in the reader's language. Error id `<form>-country-error`, as
 * every field of the form. PAD-640: also Perfil's country (settings.profile rule 11).
 */
export function CountryField({
  testID,
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  testID: string;
  label: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (code: string) => void;
}) {
  const { i18n } = useTranslation();
  return (
    <View className="gap-1.5">
      <Label testID={`${testID}-label`}>{label}</Label>
      <Select
        value={{ value, label: value ? countryName(value, i18n.language) : "" }}
        onValueChange={(opt) => {
          if (opt?.value) onChange(opt.value);
        }}
      >
        <SelectTrigger testID={testID} disabled={disabled}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code} label={countryName(c.code, i18n.language)} />
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <Text className="text-sm text-destructive" testID={`${testID}-error`} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
