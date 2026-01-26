import { useEffect, useState } from "react";
import type { CoachLevel, PlayerSide } from "@/types";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface EditPlayerInput {
  name: string;
  email?: string;
  phone?: string;
  levelId?: string;
  side?: PlayerSide;
  notes?: string;
}

interface EditPlayerSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EditPlayerInput) => void;

  levels: CoachLevel[];
  initialValues?: Partial<EditPlayerInput>;
  title?: string;
}

export function EditPlayerSheet({
  open,
  onClose,
  onSave,
  levels,
  initialValues,
  title = "Edit player",
}: EditPlayerSheetProps) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [email, setEmail] = useState(initialValues?.email ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [levelId, setLevelId] = useState<string>(initialValues?.levelId ?? "");
  const [side, setSide] = useState<PlayerSide | "">(initialValues?.side ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? "");
    setEmail(initialValues?.email ?? "");
    setPhone(initialValues?.phone ?? "");
    setLevelId(initialValues?.levelId ?? "");
    setSide(initialValues?.side ?? "");
    setNotes(initialValues?.notes ?? "");
  }, [open, initialValues]);

  const handleSave = () => {
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      levelId: levelId || undefined,
      side: side || undefined,
      notes: notes.trim() || undefined,
    });

    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="player-name">Name</Label>
            <Input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-email">Email (optional)</Label>
            <Input
              id="player-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. john@email.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-phone">Phone (optional)</Label>
            <Input
              id="player-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +351 9xx xxx xxx"
            />
          </div>

          <div className="space-y-2">
            <Label>Level (optional)</Label>
            <Select value={levelId} onValueChange={setLevelId}>
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {levels.map((lvl) => (
                  <SelectItem key={lvl.id} value={lvl.id}>
                    {lvl.code} – {lvl.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Side (optional)</Label>
            <Select value={side} onValueChange={(v) => setSide(v as PlayerSide)}>
              <SelectTrigger>
                <SelectValue placeholder="Select side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-notes">Notes (optional)</Label>
            <Input
              id="player-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything you want to remember..."
            />
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
