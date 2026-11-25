import { describe, expect, it } from "vitest";

import { joinMessage, messageTokenKey, removeMessageToken, setMessageText, splitMessage } from "./cancelReason";

describe("the editable cancellation message (classes.delete rule 13, PAD-840 phase 2)", () => {
  const TEMPLATE = "Olá {name}, aula às {time}. Motivo: {reason}.";

  it("[CLASSES-DELETE-18] splits into text and placeholder tokens and joins back to the same text", () => {
    const parts = splitMessage(TEMPLATE);
    expect(parts.map((p) => (p.kind === "token" ? `{${p.name}}` : `"${p.text}"`))).toEqual([
      '"Olá "', "{name}", '", aula às "', "{time}", '". Motivo: "', "{reason}", '"."',
    ]);
    expect(joinMessage(parts)).toBe(TEMPLATE);
    // Text always starts, ends and separates tokens, so the coach can type between two of them.
    expect(splitMessage("{name}{time}").map((p) => p.kind)).toEqual(["text", "token", "text", "token", "text"]);
    expect(splitMessage("{nonsense}")).toEqual([{ kind: "text", id: expect.any(Number), text: "{nonsense}" }]);
  });

  it("[CLASSES-DELETE-18] a token is removed whole and its neighbours join; text edits leave tokens alone", () => {
    const parts = splitMessage(TEMPLATE);
    expect(joinMessage(removeMessageToken(parts, 3))).toBe("Olá {name}, aula às . Motivo: {reason}.");
    expect(removeMessageToken(parts, 0)).toBe(parts); // text is not a token
    const edited = setMessageText(parts, 0, "Oi ");
    expect(joinMessage(edited)).toBe("Oi {name}, aula às {time}. Motivo: {reason}.");
    expect(setMessageText(parts, 1, "x")).toBe(parts); // a token's text cannot be set
  });

  it("[CLASSES-DELETE-18] parts keep their id through an edit and a removal, and a repeated placeholder gets its own key", () => {
    const parts = splitMessage("{name} e {name}, {time}");
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
    expect(messageTokenKey(parts, 1)).toBe("name");
    expect(messageTokenKey(parts, 3)).toBe("name-2");
    expect(messageTokenKey(parts, 5)).toBe("time");
    const edited = setMessageText(parts, 2, " ou ");
    expect(edited.map((p) => p.id)).toEqual(parts.map((p) => p.id));
    const removed = removeMessageToken(parts, 1);
    expect(removed.map((p) => p.id)).toEqual([parts[0].id, ...parts.slice(3).map((p) => p.id)]);
  });
});
