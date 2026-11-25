/** PAD-840 (classes.delete rule 14) on iOS: the class screen's list of kept cancellations, as on web. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { renderNative } from "@/test/render-native";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@levelup/api/src/resources/classes", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClassCancellations: api.get,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/text", async () => {
  const { Text } = await import("react-native");
  return { Text: (p: Record<string, unknown>) => createElement(Text, p) };
});
vi.mock("@/components/ui/separator", () => ({ Separator: () => null }));

import { ClassCancellationsSection } from "./class-cancellations-section";

const textOf = (node: { children: unknown[] }): string =>
  node.children.map((c) => (typeof c === "string" ? c : textOf(c as { children: unknown[] }))).join("|");
const mount = async (props: { lessonId?: string; enabled: boolean }) => {
  const ui = await renderNative(
    <QueryClientProvider client={new QueryClient()}>
      <ClassCancellationsSection {...props} formatDate={(iso) => `<${iso}>`} />
    </QueryClientProvider>,
  );
  await ui.flush();
  return ui;
};

beforeEach(() =>
  api.get.mockReset().mockResolvedValue([
    { date: "2099-12-01", scope: "future", reason: "Fim da época", sentToStudents: false },
    { date: "2099-11-24", scope: "single", reason: "Chuva", sentToStudents: true },
  ]),
);

describe("the iOS class screen's cancellations (PAD-840)", () => {
  it("[CLASSES-DELETE-21] the screen lists each cancellation with its date, reason and whether it was sent", async () => {
    const ui = await mount({ lessonId: "9", enabled: true });
    const rows = ui.root.root
      .findAll((n) => n.props?.testID === "class-cancellation-row" && typeof n.type === "string")
      .map(textOf);
    expect(api.get).toHaveBeenCalledWith("9");
    expect(rows).toEqual([
      "<2099-12-01> calendar.cancellations.andFollowing|Fim da época|calendar.cancellations.notSent",
      "<2099-11-24>|Chuva|calendar.cancellations.sent",
    ]);
  });

  it("[CLASSES-DELETE-21] a class with none shows no section, and a student never asks", async () => {
    api.get.mockResolvedValue([]);
    const none = await mount({ lessonId: "9", enabled: true });
    expect(none.queryByTestId("class-cancellations")).toBeNull();
    await mount({ lessonId: "9", enabled: false });
    expect(api.get).toHaveBeenCalledTimes(1);
    const screen = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", "app/class/[id].tsx"), "utf8");
    expect(screen).toMatch(/<ClassCancellationsSection\s+lessonId=\{instance\?\.lessonId\}\s+enabled=\{isCoach && isRecurring && !isEditing\}/);
  });
});
