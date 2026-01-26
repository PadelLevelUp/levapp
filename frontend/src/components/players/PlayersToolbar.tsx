import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PlayersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onAddPlayer: () => void;
}

export function PlayersToolbar({
  search,
  onSearchChange,
  onAddPlayer,
}: PlayersToolbarProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-bold">Players</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search players..."
            className="pl-10"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <Button onClick={onAddPlayer}>
          <Plus className="w-4 h-4 mr-2" />
          Add player
        </Button>
      </div>
    </div>
  );
}
