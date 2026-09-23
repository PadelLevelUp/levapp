import { Plus, QrCode, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortOption = "name-asc" | "name-desc" | "level-desc" | "level-asc";

interface PlayersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onAddPlayer: () => void;
  /** players.join-token rule 7 — opens the "Add by QR" dialog. */
  onAddByQr: () => void;
  sortOption: SortOption;
  onSortChange: (value: SortOption) => void;
}

export function PlayersToolbar({
  search,
  onSearchChange,
  onAddPlayer,
  onAddByQr,
  sortOption,
  onSortChange,
}: PlayersToolbarProps) {
  const { t } = useTranslation();
  // PAD-410: this toolbar now also lives inside the fixed-width master list
  // pane on desktop (w-80/w-96). Tailwind's `sm:` variants key off the
  // viewport, not the pane, so a `sm:flex-row` layout would still try to lay
  // everything out in one row even though the pane itself is much narrower
  // than that breakpoint. Everything wraps in place instead.
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">{t("players.title")}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="players-search-input"
            placeholder={t("players.searchPlaceholder")}
            className="pl-10"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <Select
          value={sortOption}
          onValueChange={(val) => onSortChange(val as SortOption)}
        >
          <SelectTrigger className="w-[180px]" aria-label={t("players.sortAriaLabel")}>
            <SelectValue placeholder={t("players.sortPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">{t("players.sortNameAsc")}</SelectItem>
            <SelectItem value="name-desc">{t("players.sortNameDesc")}</SelectItem>
            <SelectItem value="level-desc">{t("players.sortLevelDesc")}</SelectItem>
            <SelectItem value="level-asc">{t("players.sortLevelAsc")}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={onAddByQr} data-testid="players-add-by-qr">
          <QrCode className="w-4 h-4 mr-2" />
          {t("players.addByQr.button")}
        </Button>

        <Button onClick={onAddPlayer}>
          <Plus className="w-4 h-4 mr-2" />
          {t("players.addPlayer")}
        </Button>
      </div>
    </div>
  );
}
