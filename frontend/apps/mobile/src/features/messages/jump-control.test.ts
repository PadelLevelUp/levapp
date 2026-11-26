/**
 * messaging.conversation-detail rule 12 (B-734): the jump-to-bottom control is placed against the
 * message list, so the composer never covers it. It used to be placed against the whole screen
 * column, a fixed distance above its bottom edge, which the composer and the home indicator
 * outgrew. The thread screen cannot be mounted in the mobile harness
 * (thread-screen-wiring.test.ts), so its JSX tree is read instead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const FILE = join(__dirname, "..", "..", "..", "app", "conversation", "[id].tsx");
const source = ts.createSourceFile(FILE, readFileSync(FILE, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findAll(root: ts.Node, test: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (test(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
const tag = (node: ts.Node) =>
  ts.isJsxSelfClosingElement(node) ? node.tagName.getText() : ts.isJsxElement(node) ? node.openingElement.tagName.getText() : null;

describe("the jump-to-bottom control (rule 12)", () => {
  it("[MESSAGING-CONVERSATION-DETAIL-30] the jump control is placed inside the list's own box, above the composer", () => {
    const lists = findAll(source, (n) => tag(n) === "FlatList");
    expect(lists).toHaveLength(1);
    const box = lists[0].parent;
    expect(tag(box)).toBe("View");
    // The box holds the list and the control, and nothing of the composer.
    expect(findAll(box, (n) => tag(n) === "Composer")).toEqual([]);
    const controls = findAll(
      source,
      (n) => ts.isJsxAttribute(n) && n.name.getText() === "testID" && n.getText().includes("messages-jump-to-bottom")
    );
    expect(controls).toHaveLength(1);
    expect(findAll(box, (n) => n === controls[0])).toHaveLength(1);
  });
});
