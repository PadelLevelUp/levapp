import * as React from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { CoachNote } from "@levelup/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAddCoachNote, useDeleteCoachNote } from "./hooks";

interface NoteSectionProps {
  playerId: string;
  type: "strength" | "weakness";
  title: string;
  notes: CoachNote[];
  inputTestID: string;
  addTestID: string;
  addLabel: string;
  placeholder: string;
}

function NoteSection({
  playerId,
  type,
  title,
  notes,
  inputTestID,
  addTestID,
  addLabel,
  placeholder,
}: NoteSectionProps) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const addNote = useAddCoachNote();
  const deleteNote = useDeleteCoachNote();

  const handleAdd = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await addNote.mutateAsync({ playerId, type, text: trimmed });
      setText("");
    } catch {
      setError(`Failed to add ${type}.`);
    }
  };

  const handleDelete = async (note: CoachNote) => {
    setError(null);
    try {
      await deleteNote.mutateAsync({ playerId, note });
    } catch {
      setError(`Failed to remove ${type}.`);
    }
  };

  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-muted-foreground">
        {title}
      </Text>
      {notes.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          No {type === "strength" ? "strengths" : "weaknesses"} noted yet.
        </Text>
      ) : (
        notes.map((note) => (
          <View
            key={note.id}
            testID={`sw-note-${note.id}`}
            className="flex-row items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
          >
            <Text className="flex-1 text-sm">{note.text}</Text>
            <Pressable
              testID={`sw-note-delete-${note.id}`}
              accessibilityLabel={`Delete note ${note.text}`}
              role="button"
              hitSlop={8}
              onPress={() => handleDelete(note)}
            >
              <Ionicons
                name="close"
                size={18}
                color={lightTheme.mutedForeground}
              />
            </Pressable>
          </View>
        ))
      )}
      <View className="flex-row items-center gap-2">
        <Input
          testID={inputTestID}
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          value={text}
          onChangeText={setText}
          className="flex-1"
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Button
          size="sm"
          testID={addTestID}
          accessibilityLabel={addLabel}
          disabled={!text.trim() || addNote.isPending}
          onPress={handleAdd}
        >
          <Text>Add</Text>
        </Button>
      </View>
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </View>
  );
}

interface StrengthsWeaknessesProps {
  playerId: string;
  strengths: CoachNote[];
  weaknesses: CoachNote[];
}

/**
 * Mobile port of the web PlayerStrengthsWeaknesses card: add a note via
 * POST /app/add_coach_note, delete via POST /app/delete/coach_note. The
 * player-profile query is invalidated after each mutation so server-assigned
 * note ids show up immediately.
 */
export function StrengthsWeaknesses({
  playerId,
  strengths,
  weaknesses,
}: StrengthsWeaknessesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Strengths & Weaknesses</CardTitle>
      </CardHeader>
      <CardContent className="gap-5">
        <NoteSection
          playerId={playerId}
          type="strength"
          title="Strengths"
          notes={strengths}
          inputTestID="sw-add-strength-input"
          addTestID="sw-add-strength"
          addLabel="Add strength"
          placeholder="Add a strength..."
        />
        <NoteSection
          playerId={playerId}
          type="weakness"
          title="Weaknesses"
          notes={weaknesses}
          inputTestID="sw-add-weakness-input"
          addTestID="sw-add-weakness"
          addLabel="Add weakness"
          placeholder="Add a weakness..."
        />
      </CardContent>
    </Card>
  );
}
