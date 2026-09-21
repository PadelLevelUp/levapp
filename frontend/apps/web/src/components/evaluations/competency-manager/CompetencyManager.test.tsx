/**
 * evaluations.competencies rules 5-9, 12, 13 (PAD-373) — "Gerir competências" on web.
 * Asserted by test id and by the translation KEY (t is mocked to return it), never by copy.
 */
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvaluationCompetencies, EvaluationCompetency } from "@levelup/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: "pt" },
  }),
}));

const api = vi.hoisted(() => ({
  getEvaluationCompetencies: vi.fn(),
  switchOnCatalogueCompetency: vi.fn(),
  createCustomCompetency: vi.fn(),
  updateEvaluationCompetency: vi.fn(),
  deleteEvaluationCompetency: vi.fn(),
  getEvaluationCompetencyImpact: vi.fn(),
}));
vi.mock("@levelup/api/src/resources/evaluationRecords", () => api);

import { CompetencyManager } from "./CompetencyManager";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
});

function competency(over: Partial<EvaluationCompetency>): EvaluationCompetency {
  return { id: 1, key: null, name: "x", group: null, scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0, ...over };
}

const FOREHAND = competency({ id: 7, name: "Forehand", group: null, scaleMin: 1, scaleMax: 10, scoreCount: 12 });
const SAQUE = competency({ id: 13, name: "Saque cruzado", group: "custom", scoreCount: 5 });
const BANDEJA = competency({ id: 12, key: "bandeja", name: "Bandeja", group: "technique" });

const ANA: EvaluationCompetencies = {
  competencies: [BANDEJA, FOREHAND, SAQUE],
  catalogue: [{ key: "volley", group: "technique" }, { key: "transition", group: "tactics" }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function open(data: EvaluationCompetencies = ANA, onClose = vi.fn()) {
  api.getEvaluationCompetencies.mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CompetencyManager open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

const row = async (rowId: string) => {
  const found = await screen.findByTestId(`competency-row-${rowId}`);
  return found;
};

afterEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("what the manager lists (rules 2, 3, 5)", () => {
  it("shows the three kinds of row with the controls each is allowed", async () => {
    open();

    const catalogue = await row("key-bandeja");
    expect(catalogue).toHaveAttribute("data-kind", "catalogue");
    expect(within(catalogue).getByTestId("competency-toggle-key-bandeja")).toBeChecked();
    expect(within(catalogue).queryByTestId("competency-rename-key-bandeja")).toBeNull();
    expect(within(catalogue).queryByTestId("competency-delete-key-bandeja")).toBeNull();

    const legacy = await row("id-7");
    expect(legacy).toHaveAttribute("data-kind", "legacy");
    expect(within(legacy).getByTestId("competency-scale-id-7")).toHaveTextContent('"scale":"1–10"');
    expect(within(legacy).getByTestId("competency-rename-id-7")).toBeInTheDocument();
    expect(within(legacy).getByTestId("competency-delete-id-7")).toBeInTheDocument();

    const custom = await row("id-13");
    expect(custom).toHaveAttribute("data-kind", "custom");
    expect(within(custom).queryByTestId("competency-scale-id-13")).toBeNull();
    expect(within(custom).getByTestId("competency-delete-id-13")).toBeInTheDocument();

    const available = await row("key-volley");
    expect(available).toHaveAttribute("data-kind", "available");
    expect(within(available).getByTestId("competency-toggle-key-volley")).not.toBeChecked();
  });

  it("an existing coach opens onto their own categories, first, with a line saying they keep their scale (Q31)", async () => {
    open();

    await row("id-7");
    expect(screen.getAllByTestId(/^competency-group-(legacy|general|technique|tactics|custom)$/).map((el) => el.getAttribute("data-testid"))).toEqual(
      ["competency-group-legacy", "competency-group-technique", "competency-group-tactics", "competency-group-custom"]);
    expect(screen.getByTestId("competency-group-legacy")).toHaveTextContent("evaluations.manager.legacyTitle");
    expect(screen.getByTestId("competency-group-legacy-caption")).toHaveTextContent("evaluations.manager.legacyCaption");
  });

  it("names the groups in order and hides an empty one", async () => {
    open({ competencies: [BANDEJA], catalogue: [{ key: "transition", group: "tactics" }] });

    await row("key-bandeja");
    expect(screen.getAllByTestId(/^competency-group-(legacy|general|technique|tactics|custom)$/).map((el) => el.getAttribute("data-testid"))).toEqual(
      ["competency-group-technique", "competency-group-tactics"]);
    expect(screen.queryByTestId("competency-group-legacy-caption")).toBeNull();
  });

  it("says what it means when nothing is active (rule 13)", async () => {
    open({ competencies: [{ ...FOREHAND, isActive: false }], catalogue: [] });

    expect(await screen.findByTestId("competency-none-active")).toHaveTextContent("evaluations.manager.noneActive");
  });

  it("says nothing of the kind while something is active", async () => {
    open();

    await row("id-7");
    expect(screen.queryByTestId("competency-none-active")).toBeNull();
  });
});

describe("switching on and off (rules 6, 7, 12)", () => {
  it("a second tap while the request is in flight sends nothing more, and the row is disabled meanwhile", async () => {
    const pending = deferred<EvaluationCompetency>();
    api.updateEvaluationCompetency.mockReturnValue(pending.promise);
    open();
    const toggle = within(await row("id-13")).getByTestId("competency-toggle-id-13");

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    // react-query calls the mutation function on a microtask: wait for the first call,
    // then give a second one every chance to arrive before counting.
    await waitFor(() => expect(api.updateEvaluationCompetency).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(api.updateEvaluationCompetency).toHaveBeenCalledTimes(1);
    expect(api.updateEvaluationCompetency).toHaveBeenCalledWith(13, { isActive: false });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();

    api.getEvaluationCompetencies.mockResolvedValue({ ...ANA, competencies: [BANDEJA, FOREHAND, { ...SAQUE, isActive: false }] });
    await act(async () => { pending.resolve({ ...SAQUE, isActive: false }); });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).not.toBeChecked();
  });

  it("switching on a built-in entry creates it by key", async () => {
    api.switchOnCatalogueCompetency.mockResolvedValue(competency({ id: 20, key: "volley", group: "technique" }));
    open();

    fireEvent.click(within(await row("key-volley")).getByTestId("competency-toggle-key-volley"));

    await waitFor(() => expect(api.switchOnCatalogueCompetency).toHaveBeenCalledWith("volley"));
    expect(api.updateEvaluationCompetency).not.toHaveBeenCalled();
  });

  it("a failure rolls the switch back and says so on that row", async () => {
    api.updateEvaluationCompetency.mockRejectedValue({ response: { status: 500, data: "<html>" } });
    open();
    const custom = await row("id-13");
    const toggle = within(custom).getByTestId("competency-toggle-id-13");

    fireEvent.click(toggle);

    expect(await within(custom).findByTestId("competency-error-id-13")).toHaveTextContent("evaluations.manager.saveFailed");
    expect(toggle).toBeChecked();
    expect(toggle).not.toBeDisabled();
  });
});

describe("a custom competency (rules 6, 8)", () => {
  it("is added by name; a duplicate is refused inline and keeps what was typed", async () => {
    api.createCustomCompetency.mockRejectedValue({ response: { status: 409, data: { error: "duplicate_name" } } });
    open();
    await row("id-13");
    const input = screen.getByTestId("competency-add-name");

    fireEvent.change(input, { target: { value: "  saque cruzado " } });
    fireEvent.click(screen.getByTestId("competency-add-submit"));

    expect(await screen.findByTestId("competency-add-error")).toHaveTextContent("evaluations.manager.duplicateName");
    expect(api.createCustomCompetency).toHaveBeenCalledWith("saque cruzado");
    expect(input).toHaveValue("  saque cruzado ");
  });

  it("clears the field once the competency exists, and does not submit an empty name", async () => {
    api.createCustomCompetency.mockResolvedValue(competency({ id: 30, name: "Remate", group: "custom" }));
    open();
    await row("id-13");
    const input = screen.getByTestId("competency-add-name");

    fireEvent.click(screen.getByTestId("competency-add-submit"));
    expect(api.createCustomCompetency).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Remate" } });
    fireEvent.click(screen.getByTestId("competency-add-submit"));

    await waitFor(() => expect(input).toHaveValue(""));
    expect(api.createCustomCompetency).toHaveBeenCalledWith("Remate");
  });

  it("is renamed by id, and a catalogue name clash is shown on the row", async () => {
    api.updateEvaluationCompetency.mockRejectedValueOnce({ response: { status: 409, data: { error: "duplicate_name" } } });
    api.updateEvaluationCompetency.mockResolvedValueOnce({ ...SAQUE, name: "Serviço cruzado" });
    open();
    const custom = await row("id-13");

    fireEvent.click(within(custom).getByTestId("competency-rename-id-13"));
    const field = within(custom).getByTestId("competency-rename-input-id-13");
    expect(field).toHaveValue("Saque cruzado");
    fireEvent.change(field, { target: { value: "Forehand" } });
    fireEvent.click(within(custom).getByTestId("competency-rename-save-id-13"));

    expect(await within(custom).findByTestId("competency-error-id-13")).toHaveTextContent("evaluations.manager.duplicateName");
    expect(api.updateEvaluationCompetency).toHaveBeenLastCalledWith(13, { name: "Forehand" });

    fireEvent.change(field, { target: { value: "Serviço cruzado" } });
    fireEvent.click(within(custom).getByTestId("competency-rename-save-id-13"));

    await waitFor(() => expect(api.updateEvaluationCompetency).toHaveBeenLastCalledWith(13, { name: "Serviço cruzado" }));
    await waitFor(() => expect(within(custom).queryByTestId("competency-rename-input-id-13")).toBeNull());
  });
});

describe("deleting keeps PAD-274's safeguards, through the new endpoints (rule 9)", () => {
  it("shows the impact and only deletes once the name has been typed", async () => {
    api.getEvaluationCompetencyImpact.mockResolvedValue({ name: "Saque cruzado", scores: 5, players: 2 });
    api.deleteEvaluationCompetency.mockResolvedValue(undefined);
    open();

    fireEvent.click(within(await row("id-13")).getByTestId("competency-delete-id-13"));

    const impact = await screen.findByTestId("competency-delete-impact");
    expect(api.getEvaluationCompetencyImpact).toHaveBeenCalledWith(13);
    expect(impact).toHaveTextContent('"scores":5');
    expect(impact).toHaveTextContent('"players":2');
    const confirm = screen.getByTestId("competency-delete-confirm");
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByTestId("competency-delete-name"), { target: { value: "Saque" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByTestId("competency-delete-name"), { target: { value: " Saque cruzado " } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() => expect(api.deleteEvaluationCompetency).toHaveBeenCalledWith(13));
  });

  it("cannot be confirmed when the impact could not be read", async () => {
    api.getEvaluationCompetencyImpact.mockRejectedValue(new Error("Network Error"));
    open();

    fireEvent.click(within(await row("id-7")).getByTestId("competency-delete-id-7"));

    expect(await screen.findByTestId("competency-delete-impact-failed")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("competency-delete-name"), { target: { value: "Forehand" } });
    expect(screen.getByTestId("competency-delete-confirm")).toBeDisabled();
    expect(api.deleteEvaluationCompetency).not.toHaveBeenCalled();
  });
});

describe("closing (rule 12)", () => {
  it("has an explicit Concluído besides the scrim, and the caption says changes apply at once", async () => {
    const { onClose } = open();
    await row("id-7");

    expect(screen.getByTestId("competency-manager-caption")).toHaveTextContent("evaluations.manager.caption");
    fireEvent.click(screen.getByTestId("competency-manager-done"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
