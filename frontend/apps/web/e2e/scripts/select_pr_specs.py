#!/usr/bin/env python3
"""PAD-511: choose the web Playwright specs a change drives, bounded.

Reads only git (`--repo`, `--base`, `--head`), so it answers for any pair of commits: a PR's
merge base and head, or a past PR replayed. The design (accepted 2026-10-03) is
docs/plans/2026-10-03-pad-511-pr-e2e-subset.md; in short, a changed file selects:

  rank 0  a changed spec                      itself
  rank 1  a changed web component             every spec holding one of its test ids
  rank 2  a changed e2e helper / mapped file  the specs importing it / named by the map
  rank 3  a changed English locale key        the specs quoting that key (`ui("ns.key")`)
  rank 4  a changed module with no test ids   the ids of its importers (one hop, <= HOP_MAX)
  rank 5  a global, broad or packages change  the smoke set

Quarantined specs (load-sensitive, with their ledger ids) are left out unless the change edits
that spec itself. Over the cap, the best-ranked specs are kept and the result says "truncated".
The full suite is never chosen: it stays the release gate's.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

WEB = "frontend/apps/web/"
E2E = WEB + "e2e/"
SRC = WEB + "src/"
LOCALES_EN = "frontend/src/locales/en/"
CONF = E2E + "pr-subset/"
HOP_MAX = 3
DEFAULT_CAP = 25

# Changes that reach every page: the traced subset runs, plus the smoke set.
GLOBAL = [
    r"^frontend/apps/web/src/(App|main)\.tsx$",
    r"^frontend/apps/web/src/(auth|layouts?|routes?)/",
    r"^frontend/apps/web/src/components/(layout|ui)/",
    r"^frontend/apps/web/(playwright\.config\.ts|vite\.config\.ts|package\.json|index\.html)$",
    r"^frontend/apps/web/e2e/(global-setup|global-teardown|isolation)\.ts$",
    r"^frontend/apps/web/e2e/scripts/(reset-test-db\.sh|seed\.py|seed_dates\.py)$",
    r"^frontend/package(-lock)?\.json$",
    r"^backend/seed\.py$",
]
PACKAGES = r"^frontend/packages/(api|hooks|config|types)/src/"
TEST_FILE = re.compile(r"\.test\.tsx?$")
CODE_FILE = re.compile(r"\.(tsx?|jsx?)$")

ID_LIT = re.compile(r'data-testid=(?:"([^"]+)"|\{"([^"]+)"\}|\{`([^`$]+)(?:\$\{)?[^`]*`\})')
ID_PROP = re.compile(r'\btestId(?:Prefix)?=\s*"([^"]+)"')


def ids_in(src: str) -> set[str]:
    """Literal test ids and template prefixes (`x-${…}` gives `x-`) a source file renders."""
    out: set[str] = set()
    for m in ID_LIT.finditer(src):
        v = m.group(1) or m.group(2) or m.group(3)
        if v and len(v.rstrip("-")) >= 4:
            out.add(v)
    out.update(m.group(1) for m in ID_PROP.finditer(src))
    return out


def locale_keys(doc, prefix: str = "") -> dict[str, str]:
    if isinstance(doc, dict):
        out: dict[str, str] = {}
        for k, v in doc.items():
            out.update(locale_keys(v, f"{prefix}.{k}" if prefix else k))
        return out
    return {prefix: json.dumps(doc, ensure_ascii=False)}


@dataclass
class Selection:
    selected: list[str]
    driven: int
    of: int
    truncated: bool
    reasons: dict[str, list[str]]
    escalated: list[str] = field(default_factory=list)
    broad: list[str] = field(default_factory=list)
    quarantined: list[str] = field(default_factory=list)
    silent_components: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return self.__dict__


class Repo:
    def __init__(self, root: str):
        self.root = root

    def git(self, *args: str) -> str:
        r = subprocess.run(["git", "-C", self.root, *args], capture_output=True, text=True)
        return r.stdout

    def show(self, ref: str, path: str) -> str:
        return self.git("show", f"{ref}:{path}")

    def ls(self, ref: str, prefix: str) -> list[str]:
        return self.git("ls-tree", "-r", "--name-only", ref, "--", prefix).split()

    def changed(self, base: str, head: str) -> list[str]:
        return self.git("diff", "--name-only", f"{base}...{head}").split()

    def importers(self, ref: str, module: str) -> list[str]:
        stem = module[len(SRC):].rsplit(".", 1)[0]
        hits = self.git("grep", "-l", "-E", f"@/{re.escape(stem)}[\"']", ref, "--", SRC).split()
        return [h.split(":", 1)[1] for h in hits if not TEST_FILE.search(h)]


def read_list(text: str) -> list[str]:
    out = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            out.append(line)
    return out


def select(repo: Repo, base: str, head: str, cap: int = DEFAULT_CAP, conf: str | None = None) -> Selection:
    """`conf` is a directory holding the three pr-subset lists; by default they are read at
    `head`. Replaying a commit older than PAD-511 needs them from the tooling's checkout."""
    changed = repo.changed(base, head)
    specs = [p for p in repo.ls(head, E2E) if p.endswith(".spec.ts") and not p.startswith(E2E + "scripts/")]
    bodies = {s: repo.show(head, s) for s in specs}

    def conf_list(name: str) -> list[str]:
        if conf is not None:
            p = Path(conf) / name
            return read_list(p.read_text()) if p.exists() else []
        return read_list(repo.show(head, CONF + name))

    smoke = [E2E + s for s in conf_list("smoke.txt")]
    quarantine = {E2E + s for s in conf_list("quarantine.txt")}
    spec_map = [line.split() for line in conf_list("spec-map.txt")]

    rank: dict[str, int] = {}
    reasons: dict[str, list[str]] = {}

    def add(spec: str, r: int, why: str) -> None:
        if spec not in bodies:
            return
        rank[spec] = min(rank.get(spec, r), r)
        reasons.setdefault(spec, []).append(why)

    escalated, broad, silent = [], [], []
    for f in changed:
        if TEST_FILE.search(f):
            continue
        if any(re.search(g, f) for g in GLOBAL):
            escalated.append(f)
        elif re.search(PACKAGES, f):
            broad.append(f)

    for f in changed:
        if f in bodies:
            add(f, 0, "spec changed")
        elif f.startswith(E2E + "helpers/"):
            h = f.rsplit("/", 1)[-1].rsplit(".", 1)[0]
            for s, b in bodies.items():
                if re.search(rf"helpers/{re.escape(h)}[\"']", b):
                    add(s, 2, f"helper {h}")
        for glob, spec in spec_map:
            if fnmatch.fnmatch(f, glob):
                add(E2E + spec, 2, f"map {glob}")

    components = [f for f in changed if f.startswith(SRC) and CODE_FILE.search(f) and not TEST_FILE.search(f)]
    hop: list[str] = []
    for f in components:
        body = repo.show(head, f)
        ids = ids_in(body)
        if not ids:
            imps = repo.importers(head, f)
            if len(imps) > HOP_MAX:
                broad.append(f"{f} ({len(imps)} importers)")
            else:
                hop.extend(i for i in imps if i not in components and i not in hop)
            continue
        hits = 0
        for i in sorted(ids):
            for s, b in bodies.items():
                if i in b:
                    add(s, 1, f"id {i}")
                    hits += 1
        if not hits:
            silent.append(f)
    for f in hop:
        for i in sorted(ids_in(repo.show(head, f))):
            for s, b in bodies.items():
                if i in b:
                    add(s, 4, f"id {i} (imports a changed module)")

    for f in changed:
        if f.startswith(LOCALES_EN) and f.endswith(".json"):
            try:
                old = locale_keys(json.loads(repo.show(base, f) or "{}"))
                new = locale_keys(json.loads(repo.show(head, f) or "{}"))
            except json.JSONDecodeError:
                continue
            for key in sorted(k for k in old.keys() | new.keys() if old.get(k) != new.get(k)):
                for s, b in bodies.items():
                    if re.search(rf"[\"'`]{re.escape(key)}[\"'`]", b):
                        add(s, 3, f"locale {key}")

    if escalated or broad:
        for s in smoke:
            add(s, 5, "smoke (global, broad or packages change)")

    quarantined = sorted(s for s in rank if s in quarantine and rank[s] != 0)
    for s in quarantined:
        rank.pop(s)
    driven = len(rank)
    ordered = sorted(rank, key=lambda s: (rank[s], -len(reasons[s]), s))
    kept = sorted(ordered[:cap])  # run in file order: specs share one seeded database (B-101)
    return Selection(
        selected=kept,
        driven=driven,
        of=len(specs),
        truncated=driven > cap,
        reasons={s: reasons[s] for s in kept},
        escalated=escalated,
        broad=broad,
        quarantined=quarantined,
        silent_components=silent,
    )


def summary_md(sel: Selection, label: str) -> str:
    head = f"### E2E subset {label}: {len(sel.selected)} of {sel.of} specs"
    if sel.truncated:
        head += f" (truncated: {len(sel.selected)} of {sel.driven} driven)"
    lines = [head, "", "Subset only; the full suite runs at the release gate.", ""]
    if not sel.selected:
        lines.append("No spec is driven by this change.")
    for s in sel.selected:
        lines.append(f"- `{s[len(WEB):]}`: {', '.join(sel.reasons[s][:3])}")
    for title, items in (
        ("Changed components that drive no spec", sel.silent_components),
        ("Quarantined (load-sensitive), left out", sel.quarantined),
        ("Global changes (smoke set added)", sel.escalated),
        ("Broad changes (smoke set added)", sel.broad),
    ):
        if items:
            lines += ["", f"**{title}:** " + ", ".join(f"`{i}`" for i in items)]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", default=".")
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", required=True)
    ap.add_argument("--cap", type=int, default=DEFAULT_CAP)
    ap.add_argument("--label", default="")
    ap.add_argument("--conf", help="directory of smoke.txt / quarantine.txt / spec-map.txt (default: read at --head)")
    ap.add_argument("--json", dest="json_out")
    ap.add_argument("--summary")
    ap.add_argument("--files", help="write the selected specs, relative to frontend/apps/web, one per line")
    a = ap.parse_args(argv)
    sel = select(Repo(a.repo), a.base, a.head, a.cap, a.conf)
    if a.json_out:
        Path(a.json_out).write_text(json.dumps(sel.as_dict(), indent=1))
    if a.summary:
        with open(a.summary, "a") as fh:
            fh.write(summary_md(sel, a.label))
    if a.files:
        Path(a.files).write_text("".join(s[len(WEB):] + "\n" for s in sel.selected))
    print(summary_md(sel, a.label))
    return 0


if __name__ == "__main__":
    sys.exit(main())
