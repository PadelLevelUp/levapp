"""PAD-511: the PR subset selector picks the specs a change drives, and only those.

Each test builds a small git repository with the monorepo's layout, commits a base, changes
files, and asks `select` for base..head. Pure: git only, no Flask, no database, no browser.
"""
import json
import subprocess

import pytest

from select_pr_specs import Repo, ids_in, select, summary_md

WEB = "frontend/apps/web/"
E2E = WEB + "e2e/"


def _git(root, *args):
    subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True)


class World:
    def __init__(self, root):
        self.root = root
        _git(root, "init", "-q", "-b", "main")
        _git(root, "config", "user.email", "t@example.com")
        _git(root, "config", "user.name", "t")
        self.write(E2E + "pr-subset/smoke.txt", "auth/login.spec.ts\n")
        self.write(E2E + "pr-subset/quarantine.txt", "flaky/slow.spec.ts  # B-079\n")
        self.write(E2E + "pr-subset/spec-map.txt", f"{WEB}src/pages/Privacy.tsx  landing/landing.spec.ts\n")
        self.write(E2E + "auth/login.spec.ts", 'getByTestId("login-submit")')
        self.write(E2E + "landing/landing.spec.ts", "page.goto('/')")

    def write(self, path, text):
        p = self.root / path
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)

    def commit(self):
        _git(self.root, "add", "-A")
        _git(self.root, "commit", "-q", "-m", "c", "--allow-empty")
        return subprocess.run(["git", "-C", str(self.root), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    def pick(self, base, head, cap=25):
        return select(Repo(str(self.root)), base, head, cap)


@pytest.fixture
def world(tmp_path):
    return World(tmp_path)


def _names(sel):
    return [s[len(E2E):] for s in sel.selected]


def test_ids_in_reads_literals_template_prefixes_and_testid_props():
    src = '''<div data-testid="engine-card"/> <b data-testid={`history-row-${id}`}/> <u data-testid={`row-${id}`}/> <i data-testid={"plain-id"}/>
             <Sign testId="engine-sign"/> <x data-testid="ab"/>'''
    # under four characters (`ab`, `row-`) is too short to grep for
    assert ids_in(src) == {"engine-card", "history-row-", "plain-id", "engine-sign"}


def test_a_changed_component_selects_the_specs_holding_its_test_ids(world):
    world.write(WEB + "src/components/Engine.tsx", '<div data-testid="engine-toggle"/>')
    world.write(E2E + "settings/engine.spec.ts", 'getByTestId("engine-toggle")')
    world.write(E2E + "settings/other.spec.ts", 'getByTestId("something-else")')
    base = world.commit()
    world.write(WEB + "src/components/Engine.tsx", '<div className="flex"><div data-testid="engine-toggle"/></div>')
    head = world.commit()
    sel = world.pick(base, head)
    assert _names(sel) == ["settings/engine.spec.ts"]
    assert sel.reasons[E2E + "settings/engine.spec.ts"] == ["id engine-toggle"]


def test_a_template_id_prefix_reaches_the_specs_using_its_instances(world):
    world.write(WEB + "src/components/Nav.tsx", "<a data-testid={`settings-nav-${s.id}`}/>")
    world.write(E2E + "settings/nav.spec.ts", 'getByTestId("settings-nav-notifications")')
    base = world.commit()
    world.write(WEB + "src/components/Nav.tsx", "<a className='x' data-testid={`settings-nav-${s.id}`}/>")
    assert _names(world.pick(base, world.commit())) == ["settings/nav.spec.ts"]


def test_a_changed_spec_and_a_changed_helper_select_themselves_and_the_importers(world):
    world.write(E2E + "helpers/auth.ts", "export const x = 1")
    world.write(E2E + "a/uses-helper.spec.ts", 'import { x } from "../helpers/auth";')
    world.write(E2E + "a/edited.spec.ts", "test()")
    base = world.commit()
    world.write(E2E + "helpers/auth.ts", "export const x = 2")
    world.write(E2E + "a/edited.spec.ts", "test(); test()")
    sel = world.pick(base, world.commit())
    assert _names(sel) == ["a/edited.spec.ts", "a/uses-helper.spec.ts"]


def test_a_module_without_ids_selects_through_its_few_importers_and_a_widely_imported_one_is_broad(world):
    world.write(WEB + "src/lib/format.ts", "export const f = 1")
    world.write(WEB + "src/components/Card.tsx", 'import { f } from "@/lib/format";\n<div data-testid="card-x"/>')
    world.write(E2E + "c/card.spec.ts", 'getByTestId("card-x")')
    world.write(WEB + "src/lib/client.ts", "export const c = 1")
    for i in range(4):
        world.write(WEB + f"src/pages/P{i}.tsx", f'import {{ c }} from "@/lib/client";\n<div data-testid="page-{i}x"/>')
    world.write(E2E + "p/page.spec.ts", 'getByTestId("page-0x")')
    base = world.commit()
    world.write(WEB + "src/lib/format.ts", "export const f = 2")
    world.write(WEB + "src/lib/client.ts", "export const c = 2")
    sel = world.pick(base, world.commit())
    # format.ts has one importer: its ids select card.spec. client.ts has four: broad, so smoke.
    assert _names(sel) == ["auth/login.spec.ts", "c/card.spec.ts"]
    assert sel.broad == [WEB + "src/lib/client.ts (4 importers)"]
    assert "page.spec.ts" not in " ".join(sel.selected)


def test_a_changed_english_key_selects_the_specs_quoting_it(world):
    world.write("frontend/src/locales/en/dashboard.json", json.dumps({"dashboard": {"title": "A", "other": "B"}}))
    world.write(E2E + "d/title.spec.ts", 'ui("dashboard.title")')
    world.write(E2E + "d/other.spec.ts", 'ui("dashboard.other")')
    base = world.commit()
    world.write("frontend/src/locales/en/dashboard.json", json.dumps({"dashboard": {"title": "A2", "other": "B"}}))
    sel = world.pick(base, world.commit())
    assert _names(sel) == ["d/title.spec.ts"]


@pytest.mark.parametrize("path", [WEB + "src/App.tsx", "frontend/packages/config/src/index.ts", "backend/seed.py"])
def test_a_global_or_packages_change_adds_the_smoke_set_never_the_full_suite(world, path):
    world.write(path, "1")
    world.write(E2E + "x/unrelated.spec.ts", "test()")
    base = world.commit()
    world.write(path, "2")
    sel = world.pick(base, world.commit())
    assert _names(sel) == ["auth/login.spec.ts"]


def test_a_quarantined_spec_is_left_out_unless_the_change_edits_it(world):
    world.write(WEB + "src/components/Slow.tsx", '<div data-testid="slow-thing"/>')
    world.write(E2E + "flaky/slow.spec.ts", 'getByTestId("slow-thing")')
    base = world.commit()
    world.write(WEB + "src/components/Slow.tsx", '<p data-testid="slow-thing"/>')
    mid = world.commit()
    sel = world.pick(base, mid)
    assert sel.selected == [] and sel.quarantined == [E2E + "flaky/slow.spec.ts"]
    world.write(E2E + "flaky/slow.spec.ts", 'getByTestId("slow-thing"); // edited')
    assert _names(world.pick(base, world.commit())) == ["flaky/slow.spec.ts"]


def test_the_map_covers_a_page_no_spec_reaches_by_test_id(world):
    world.write(WEB + "src/pages/Privacy.tsx", "<p>privacy</p>")
    base = world.commit()
    world.write(WEB + "src/pages/Privacy.tsx", "<p>privacy policy</p>")
    sel = world.pick(base, world.commit())
    assert _names(sel) == ["landing/landing.spec.ts"]
    assert sel.silent_components == []  # no ids at all is the map's case, not a silent component


def test_over_the_cap_the_best_ranked_are_kept_in_file_order_and_it_says_truncated(world):
    world.write(WEB + "src/components/Big.tsx", '<div data-testid="big-thing"/>')
    for i in range(5):
        world.write(E2E + f"z/s{i}.spec.ts", 'getByTestId("big-thing")')
    base = world.commit()
    world.write(WEB + "src/components/Big.tsx", '<span data-testid="big-thing"/>')
    world.write(E2E + "z/s4.spec.ts", 'getByTestId("big-thing"); // edited')
    sel = world.pick(base, world.commit(), cap=3)
    # s4 is edited (rank 0) so it is kept; the rest tie on rank and are kept by path.
    assert _names(sel) == ["z/s0.spec.ts", "z/s1.spec.ts", "z/s4.spec.ts"]
    assert sel.truncated and sel.driven == 5
    assert "truncated: 3 of 5 driven" in summary_md(sel, "")


def test_an_empty_subset_is_a_result_that_names_the_components_driving_nothing(world):
    world.write(WEB + "src/components/Lonely.tsx", '<div data-testid="lonely-thing"/>')
    base = world.commit()
    world.write(WEB + "src/components/Lonely.tsx", '<span data-testid="lonely-thing"/>')
    sel = world.pick(base, world.commit())
    assert sel.selected == [] and sel.silent_components == [WEB + "src/components/Lonely.tsx"]
    text = summary_md(sel, "")
    assert "0 of" in text and "No spec is driven by this change." in text


def test_component_tests_and_scripts_specs_are_never_selected(world):
    world.write(E2E + "scripts/redesign-shots.spec.ts", 'getByTestId("shot-thing")')
    world.write(WEB + "src/components/Shot.tsx", '<div data-testid="shot-thing"/>')
    world.write(WEB + "src/components/Shot.test.tsx", "it()")
    base = world.commit()
    world.write(WEB + "src/components/Shot.tsx", '<b data-testid="shot-thing"/>')
    world.write(WEB + "src/components/Shot.test.tsx", "it(); it()")
    sel = world.pick(base, world.commit())
    assert sel.selected == [] and sel.of == 2


def test_the_lists_can_come_from_another_checkout_when_head_predates_them(world, tmp_path_factory):
    """Phase 0 replays commits older than PAD-511: the lists come from the tooling's checkout."""
    world.write(WEB + "src/App.tsx", "1")
    base = world.commit()
    _git(world.root, "rm", "-q", "-r", E2E + "pr-subset")
    world.write(WEB + "src/App.tsx", "2")
    head = world.commit()
    assert world.pick(base, head).selected == []  # no smoke list at head
    conf = tmp_path_factory.mktemp("conf")
    (conf / "smoke.txt").write_text("auth/login.spec.ts\n")
    sel = select(Repo(str(world.root)), base, head, conf=str(conf))
    assert _names(sel) == ["auth/login.spec.ts"]
