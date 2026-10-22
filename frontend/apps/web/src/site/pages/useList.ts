import { useTranslation } from "react-i18next";

/** A list from the locale file (checks, steps, figures), read with `returnObjects`; [] when absent. */
export function useList<T>() {
  const { t } = useTranslation();
  return (key: string): T[] => {
    const value = t(key, { returnObjects: true }) as unknown;
    return Array.isArray(value) ? (value as T[]) : [];
  };
}
