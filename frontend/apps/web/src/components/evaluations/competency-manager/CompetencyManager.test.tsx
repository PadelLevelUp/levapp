/**
 * evaluations.competencies rules 5-9, 12-14 (PAD-373) — "Gerir competências" on web.
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

const viewport = vi.hoisted(() => ({ phone: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.phone }));

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
// PAD-431: a sub-category sits under its category (evaluations.competencies rule 15).
const TECHNIQUE = competency({ id: 1, key: "technique", name: "Técnica", group: "general", parentId: null });
const BANDEJA = competency({ id: 12, key: "bandeja", name: "Bandeja", group: "technique", parentId: 1 });

const ANA: EvaluationCompetencies = {
  competencies: [TECHNIQUE, BANDEJA, FOREHAND, SAQUE],
  catalogue: [{ key: "volley", group: "technique" }, { key: "tactics", group: "general" }, { key: "transition", group: "tactics" }],
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
    // PAD-431 (rules 8, 9): a default can be renamed and deleted too.
    expect(within(catalogue).getByTestId("competency-rename-key-bandeja")).toBeInTheDocument();
    expect(within(catalogue).getByTestId("competency-delete-key-bandeja")).toBeInTheDocument();

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
    // PAD-431: their own first, then the defaults (Técnica held, Tática offered), then their own categories.
    expect(screen.getAllByTestId(/^competency-section-/).map((el) => el.getAttribute("data-testid"))).toEqual(
      ["competency-section-legacy", "competency-section-key-technique", "competency-section-key-tactics", "competency-section-id-13"]);
    expect(screen.getByTestId("competency-group-legacy")).toHaveTextContent("evaluations.manager.legacyTitle");
    expect(screen.getByTestId("competency-group-legacy-caption")).toHaveTextContent("evaluations.manager.legacyCaption");
  });

  it("lists only the sections that have something, and no legacy caption without legacy rows", async () => {
    open({ competencies: [TECHNIQUE, BANDEJA], catalogue: [{ key: "transition", group: "tactics" }] });

    await row("key-bandeja");
    expect(screen.getAllByTestId(/^competency-section-/).map((el) => el.getAttribute("data-testid"))).toEqual(
      ["competency-section-key-technique", "competency-section-key-tactics"]);
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

// PAD-431 (evaluations.competencies rules 8, 9, 15): "Definir categorias de avaliação".
describe("categories and sub-categories (PAD-431)", () => {
  it("each category heads its section, its sub-categories under it with the defaults it lacks", async () => {
    open();

    const technique = await screen.findByTestId("competency-section-key-technique");
    expect(within(technique).getByTestId("competency-row-key-technique")).toHaveAttribute("data-level", "category");
    expect(within(technique).getByTestId("competency-row-key-bandeja")).toHaveAttribute("data-level", "sub");
    expect(within(technique).getByTestId("competency-row-key-volley")).toHaveAttribute("data-kind", "available");
    const tactics = screen.getByTestId("competency-section-key-tactics");
    expect(within(tactics).getByTestId("competency-row-key-tactics")).toHaveAttribute("data-kind", "available");
    expect(within(tactics).getByTestId("competency-row-key-transition")).toHaveAttribute("data-level", "sub");
  });

  it("adds a sub-category under a held category, by parentId", async () => {
    api.createCustomCompetency.mockResolvedValue(competency({ id: 30, name: "Recuperação", group: "custom", parentId: 1 }));
    open();

    const technique = await screen.findByTestId("competency-section-key-technique");
    fireEvent.change(within(technique).getByTestId("competency-add-sub-key-technique-name"), { target: { value: " Recuperação " } });
    fireEvent.click(within(technique).getByTestId("competency-add-sub-key-technique-submit"));

    await waitFor(() => expect(api.createCustomCompetency).toHaveBeenCalledWith("Recuperação", 1));
    // an offered default has no row yet, so nothing can be added under it
    expect(within(screen.getByTestId("competency-section-key-tactics")).queryByTestId("competency-add-sub-key-tactics-name")).toBeNull();
  });

  it("a new category is added below every section, without a parent", async () => {
    api.createCustomCompetency.mockResolvedValue(competency({ id: 31, name: "Grit", group: "custom", parentId: null }));
    open();

    fireEvent.change(await screen.findByTestId("competency-add-name"), { target: { value: "Grit" } });
    fireEvent.click(screen.getByTestId("competency-add-submit"));

    await waitFor(() => expect(api.createCustomCompetency).toHaveBeenCalledWith("Grit"));
  });

  it("deleting a category names the sub-categories that go with it", async () => {
    api.getEvaluationCompetencyImpact.mockResolvedValue({ name: "Técnica", scores: 3, players: 2 });
    open();

    fireEvent.click(await screen.findByTestId("competency-delete-key-technique"));

    // a default is named by its key (competencyLabel)
    expect(await screen.findByTestId("competency-delete-subs")).toHaveTextContent(
      /evaluations\.manager\.deleteSubCategories.*evaluations\.catalogue\.bandeja/,
    );
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

describe("nothing moves under the finger (Q31's layout half — Session-B's review of #361)", () => {
  it("switching the last active row off shows the notice BELOW the rows: the switches keep their positions", async () => {
    const only = { ...FOREHAND, isActive: true };
    api.updateEvaluationCompetency.mockResolvedValue({ ...only, isActive: false });
    open({ competencies: [only], catalogue: [{ key: "volley", group: "technique" }] });
    const legacyRow = await row("id-7");
    // what the server lists after the switch-off (open() had set the GET mock to the "before" list)
    api.getEvaluationCompetencies.mockResolvedValue({ competencies: [{ ...only, isActive: false }], catalogue: [{ key: "volley", group: "technique" }] });
    const before = screen.getAllByTestId(/^competency-row-/).map((el) => el.getAttribute("data-testid"));

    fireEvent.click(within(legacyRow).getByTestId("competency-toggle-id-7"));

    const notice = await screen.findByTestId("competency-none-active");
    const rows = screen.getAllByTestId(/^competency-row-/);
    expect(rows.map((el) => el.getAttribute("data-testid"))).toEqual(before);
    // every row precedes the notice in the document: it appeared under them, not above
    for (const el of rows) {
      expect(el.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("two rows toggled in quick succession both end where the server put them (no snap-back)", async () => {
    const first = deferred<EvaluationCompetency>();
    const second = deferred<EvaluationCompetency>();
    api.updateEvaluationCompetency
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    open();
    const saque = within(await row("id-13")).getByTestId("competency-toggle-id-13");
    const bandeja = within(await row("key-bandeja")).getByTestId("competency-toggle-key-bandeja");
    expect(saque).toBeChecked();
    expect(bandeja).toBeChecked();

    fireEvent.click(saque);
    fireEvent.click(bandeja);
    await waitFor(() => expect(api.updateEvaluationCompetency).toHaveBeenCalledTimes(2));
    // the re-list after both would answer with both off; the first answer must not wait for it
    api.getEvaluationCompetencies.mockResolvedValue({
      ...ANA, competencies: [TECHNIQUE, { ...BANDEJA, isActive: false }, FOREHAND, { ...SAQUE, isActive: false }],
    });
    await act(async () => { first.resolve({ ...SAQUE, isActive: false }); });
    await waitFor(() => expect(saque).not.toBeDisabled());
    expect(saque).not.toBeChecked(); // was: snapped back to checked until the second GET landed
    await act(async () => { second.resolve({ ...BANDEJA, isActive: false }); });
    await waitFor(() => expect(bandeja).not.toBeDisabled());
    expect(bandeja).not.toBeChecked();
    expect(saque).not.toBeChecked();
    expect(api.updateEvaluationCompetency).toHaveBeenNthCalledWith(1, 13, { isActive: false });
    expect(api.updateEvaluationCompetency).toHaveBeenNthCalledWith(2, 12, { isActive: false });
  });

  it("a rename, then a delete: the name to type is the NEW one, whatever the impact cached", async () => {
    api.updateEvaluationCompetency.mockResolvedValue({ ...SAQUE, name: "Serviço cruzado" });
    api.getEvaluationCompetencyImpact.mockResolvedValue({ name: "Saque cruzado", scores: 5, players: 2 }); // a stale copy
    api.deleteEvaluationCompetency.mockResolvedValue(undefined);
    open();
    const custom = await row("id-13");
    fireEvent.click(within(custom).getByTestId("competency-rename-id-13"));
    fireEvent.change(within(custom).getByTestId("competency-rename-input-id-13"), { target: { value: "Serviço cruzado" } });
    // what the server lists after the rename — the re-list must not put the old name back
    api.getEvaluationCompetencies.mockResolvedValue({ ...ANA, competencies: [BANDEJA, FOREHAND, { ...SAQUE, name: "Serviço cruzado" }] });
    fireEvent.click(within(custom).getByTestId("competency-rename-save-id-13"));
    await waitFor(() => expect(api.updateEvaluationCompetency).toHaveBeenCalledWith(13, { name: "Serviço cruzado" }));
    await waitFor(() => expect(within(custom).queryByTestId("competency-rename-input-id-13")).toBeNull());

    fireEvent.click(within(custom).getByTestId("competency-delete-id-13"));
    await screen.findByTestId("competency-delete-impact");
    const confirm = screen.getByTestId("competency-delete-confirm");
    fireEvent.change(screen.getByTestId("competency-delete-name"), { target: { value: "Saque cruzado" } });
    expect(confirm).toBeDisabled(); // the OLD name no longer opens the door
    fireEvent.change(screen.getByTestId("competency-delete-name"), { target: { value: "Serviço cruzado" } });
    expect(confirm).not.toBeDisabled();
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

describe("presentation (rule 14)", () => {
  afterEach(() => { viewport.phone = false; });

  it("is a modal on desktop and a sheet at phone width — the same body, the same Concluído", async () => {
    open();
    await row("id-7");
    expect(screen.getByTestId("competency-manager")).toHaveAttribute("data-presentation", "modal");
  });

  it("at phone width it is a sheet, with every row and the close still there", async () => {
    viewport.phone = true;
    const { onClose } = open();
    await row("id-7");

    expect(screen.getByTestId("competency-manager")).toHaveAttribute("data-presentation", "sheet");
    expect(screen.getByTestId("competency-add-name")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("competency-manager-done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
