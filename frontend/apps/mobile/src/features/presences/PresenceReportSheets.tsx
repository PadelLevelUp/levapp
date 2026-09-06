import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  PINNED_COLUMN,
  PRESENCE_COLUMNS,
  type PresenceColumnKey,
  type PresenceFilters,
  type PresenceSort,
  type SortDirection,
  nextSort,
  toggleColumn,
} from "./report-state";

/**
 * "Total presences — descending". Spelled out for VoiceOver, which cannot see
 * the arrow glyph that carries the direction visually.
 *
 * Extracted rather than inlined so the two direction keys each sit in a plain
 * translation call with a literal key: `presences-i18n.test.ts` scans these
 * files for exactly that shape, and a ternary passed to the translator is a
 * pair of keys it silently skips.
 */
function sortChipLabel(
  columnLabel: string,
  active: boolean,
  ascending: string,
  descending: string,
  direction: SortDirection
): string {
  if (!active) return columnLabel;
  return `${columnLabel} — ${direction === "asc" ? ascending : descending}`;
}

/**
 * PAD-166 — the two table controls web puts in its toolbar, as sheets.
 *
 * Web has room to sit two number fields, a column dropdown and an Export button
 * in the table header, and to sort by tapping a column heading. A phone list
 * has no column headings and no toolbar, so the same semantics move into
 * sheets reached from a compact button row: filters (with sort, which the
 * missing headings have to live somewhere) and the column chooser.
 *
 * Both edit *drafts* and commit on Apply. On web every keystroke re-filters a
 * table the coach can see; here the list is behind the sheet, so applying live
 * would mean dismissing the sheet to find out what happened. Cancelling
 * restores what was there when the sheet opened.
 */

export function PresenceFiltersSheet({
  open,
  onOpenChange,
  filters,
  sort,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: PresenceFilters;
  sort: PresenceSort;
  onApply: (next: { filters: PresenceFilters; sort: PresenceSort }) => void;
}) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();

  const [draft, setDraft] = React.useState(filters);
  const [draftSort, setDraftSort] = React.useState(sort);

  // Re-seed from the committed state each time the sheet opens, so a cancelled
  // edit does not linger into the next open.
  React.useEffect(() => {
    if (open) {
      setDraft(filters);
      setDraftSort(sort);
    }
  }, [open, filters, sort]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxHeight: height * 0.85 }}>
        <DialogHeader>
          <DialogTitle>{t("presences.table.filters")}</DialogTitle>
        </DialogHeader>

        <ScrollView contentContainerClassName="gap-4 pb-2">
          <View className="gap-1.5">
            <Text className="text-xs text-muted-foreground">
              {t("presences.table.minTotal")}
            </Text>
            <Input
              testID="presences-filter-min-total"
              value={draft.minTotal}
              onChangeText={(minTotal) =>
                setDraft((prev) => ({ ...prev, minTotal }))
              }
              keyboardType="number-pad"
              placeholder="0"
              accessibilityLabel={t("presences.table.minTotal")}
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-xs text-muted-foreground">
              {t("presences.table.maxUnjustified")}
            </Text>
            <Input
              testID="presences-filter-max-unjustified"
              value={draft.maxUnjustified}
              onChangeText={(maxUnjustified) =>
                setDraft((prev) => ({ ...prev, maxUnjustified }))
              }
              keyboardType="number-pad"
              // "any", not "0" — the placeholder states what an empty field
              // means, and an empty max is no ceiling at all.
              placeholder={t("presences.table.any")}
              accessibilityLabel={t("presences.table.maxUnjustified")}
            />
          </View>

          <View className="gap-2">
            <Text className="text-xs text-muted-foreground">
              {t("presences.table.sortBy")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {PRESENCE_COLUMNS.map((column) => {
                const active = draftSort.key === column.key;
                return (
                  <Pressable
                    key={column.key}
                    testID={`presences-sort-${column.key}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    // Tapping the active chip flips direction, exactly as
                    // tapping web's active column heading does.
                    accessibilityLabel={sortChipLabel(
                      t(`presences.column.${column.key}`),
                      active,
                      t("presences.table.sortAsc"),
                      t("presences.table.sortDesc"),
                      draftSort.direction
                    )}
                    onPress={() =>
                      setDraftSort((prev) => nextSort(prev, column.key))
                    }
                    className={cn(
                      "flex-row items-center gap-1 rounded-full border px-3 py-1.5",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card"
                    )}
                  >
                    <Text
                      className={cn(
                        "text-xs",
                        active ? "font-sans-bold text-primary" : "text-foreground"
                      )}
                    >
                      {t(`presences.column.${column.key}`)}
                    </Text>
                    {active ? (
                      <Ionicons
                        name={
                          draftSort.direction === "asc"
                            ? "arrow-up"
                            : "arrow-down"
                        }
                        size={12}
                        color={lightTheme.primary}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        <View className="mt-2 flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            testID="presences-filters-reset"
            onPress={() => {
              // Reset clears the numbers and restores the default order, but
              // keeps the search box: that field is on the screen behind the
              // sheet, and wiping text the coach can see from a control they
              // cannot is a surprise.
              setDraft((prev) => ({ ...EMPTY_FILTERS, query: prev.query }));
              setDraftSort(DEFAULT_SORT);
            }}
          >
            <Text>{t("presences.table.reset")}</Text>
          </Button>
          <Button
            className="flex-1"
            testID="presences-filters-apply"
            onPress={() => {
              onApply({ filters: draft, sort: draftSort });
              onOpenChange(false);
            }}
          >
            <Text>{t("presences.table.apply")}</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}

export function PresenceColumnsSheet({
  open,
  onOpenChange,
  visible,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visible: PresenceColumnKey[];
  onApply: (next: PresenceColumnKey[]) => void;
}) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();

  const [draft, setDraft] = React.useState(visible);

  React.useEffect(() => {
    if (open) setDraft(visible);
  }, [open, visible]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxHeight: height * 0.85 }}>
        <DialogHeader>
          <DialogTitle>{t("presences.table.visibleColumns")}</DialogTitle>
        </DialogHeader>

        <Text className="mb-2 text-xs text-muted-foreground">
          {t("presences.table.columnsHint")}
        </Text>

        <ScrollView contentContainerClassName="gap-1 pb-2">
          {PRESENCE_COLUMNS.map((column) => {
            const checked = draft.includes(column.key);
            // The pinned column is what every other cell is about, on the list
            // and in the CSV alike.
            const pinned = column.key === PINNED_COLUMN;
            return (
              <Pressable
                key={column.key}
                testID={`presences-column-${column.key}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: pinned }}
                accessibilityLabel={t(`presences.column.${column.key}`)}
                disabled={pinned}
                onPress={() =>
                  setDraft((prev) => toggleColumn(prev, column.key))
                }
                className={cn(
                  "flex-row items-center gap-3 rounded-lg px-2 py-2.5",
                  pinned && "opacity-60"
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={pinned}
                  onCheckedChange={() =>
                    setDraft((prev) => toggleColumn(prev, column.key))
                  }
                />
                <Text className="flex-1 text-sm">
                  {t(`presences.column.${column.key}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View className="mt-2 flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            testID="presences-columns-cancel"
            onPress={() => onOpenChange(false)}
          >
            <Text>{t("presences.table.cancel")}</Text>
          </Button>
          <Button
            className="flex-1"
            testID="presences-columns-apply"
            onPress={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            <Text>{t("presences.table.apply")}</Text>
          </Button>
        </View>
      </DialogContent>
    </Dialog>
  );
}
