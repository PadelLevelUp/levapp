/**
 * PAD-797 (dashboard.blocks rule 12c). With two classes running at once (two courts), the coach's
 * hero showed only the one that started first. The server now sends the others in `alsoRunning`
 * (its clock is pinned in test_pad797_two_running_classes_on_the_hero.py); the shell reads no
 * clock, so the payload is the input: one "A DECORRER" card per running class, each with its own
 * start–end and Abrir, and no invite button.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ReactTestInstance } from "react-test-renderer";
import type { DashboardNextClassBlock } from "@levelup/types";
import { renderNative } from "@/test/render-native";

vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key} ${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));
// `./blocks` pulls in `@/components/ui/toast`, which reaches `@expo/vector-icons` at import time.
vi.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

import { NextClassHero } from "./blocks";

const text = (node: ReactTestInstance): string =>
  node.children.map((c) => (typeof c === "string" ? c : text(c))).join("");

const card = (id: string, title: string, startTime: string, endTime: string) => ({
  classId: id,
  title,
  date: "2026-10-29",
  startTime,
  endTime,
  isToday: true,
  inProgress: true,
  weekday: "Thursday",
  minutesUntil: null,
  filled: 0,
  capacity: 2,
  players: [],
  href: `/calendar?classId=${id}&date=2026-10-29`,
});

const hero = (alsoRunning?: ReturnType<typeof card>[]) =>
  ({
    id: "next_class",
    type: "next_class",
    data: { ...card("lessoninstance-1", "Treino A", "19:30", "21:00"), ...(alsoRunning ? { alsoRunning } : {}) },
  }) as unknown as DashboardNextClassBlock;

// Host and composite both carry a testID; keep the host nodes.
const hosts = (root: ReactTestInstance, id: string) =>
  root.findAll((node) => node.props.testID === id && typeof node.type === "string");

describe("two classes running at once on the coach's home (PAD-797)", () => {
  it("shows one A DECORRER card per running class, each with its own times", async () => {
    const n = await renderNative(
      createElement(NextClassHero, { block: hero([card("lessoninstance-2", "Treino B", "20:00", "21:00")]) }),
    );

    const first = text(n.byTestId("dashboard-next-class"));
    expect(first).toContain("Treino A");
    expect(first).toContain('dashboard.hero.inProgress {"start":"19:30","end":"21:00"}');
    const others = hosts(n.root.root, "dashboard-next-class-running").map(text);
    expect(others).toHaveLength(1);
    expect(others[0]).toContain("Treino B");
    expect(others[0]).toContain('dashboard.hero.inProgress {"start":"20:00","end":"21:00"}');
    expect(others[0]).not.toContain("Treino A");
    expect(others[0]).toContain("dashboard.hero.open");
    expect(`${first}${others[0]}`).not.toMatch(/invite|notify/i);
  });

  it("one running class is a single card, as in PAD-792", async () => {
    const n = await renderNative(createElement(NextClassHero, { block: hero() }));

    expect(text(n.byTestId("dashboard-next-class"))).toContain("Treino A");
    expect(hosts(n.root.root, "dashboard-next-class-running")).toHaveLength(0);
  });
});
