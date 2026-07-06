import { Plus, Search } from "lucide-react";
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
  sortOption: SortOption;
  onSortChange: (value: SortOption) => void;
}

export function PlayersToolbar({
  search,
  onSearchChange,
  onAddPlayer,
  sortOption,
  onSortChange,
}: PlayersToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-bold">{t("players.title")}</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
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

        <Button onClick={onAddPlayer}>
          <Plus className="w-4 h-4 mr-2" />
          {t("players.addPlayer")}
        </Button>
      </div>
    </div>
  );
}
