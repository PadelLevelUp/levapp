#!/usr/bin/env python3
"""Enumerate open PRs across the LevelUp repos and group them by Linear ticket.

Cross-repo tickets are the reason this script exists: PAD-75 is backend #62 AND
frontend #83. Landing one half without the other ships a frontend calling an
endpoint that doesn't exist (or a backend nobody calls), and the joint E2E gate
will fail in a way that's hard to attribute. Grouping first makes the batch unit
a *ticket*, not a PR.

Usage:
    python3 list_batch.py                       # every open PR, both repos
    python3 list_batch.py --only PAD-75,PAD-89  # just these tickets
    python3 list_batch.py --exclude PAD-92      # everything except these
    python3 list_batch.py --json                # machine-readable, for the agent

Requires `gh` authenticated as an account that can see BOTH repos
(levelup_frontend is private — see the preflight step in SKILL.md).
"""

import argparse
import json
import re
import subprocess
import sys

REPOS = {
    "backend": "PadelLevelUp/levelup_backend",
    "frontend": "PadelLevelUp/levelup_frontend",
}

# Branch/title naming has drifted over time: feature/lvl-pad-101, feature/pad-75-notify-cancel,
# feature/lvl-51, "LVL-PAD-100: ...", "PAD-101: ...". All of these mean one ticket.
PAD_RE = re.compile(r"\b(?:lvl[-_])?pad[-_](\d+)\b", re.IGNORECASE)
LVL_RE = re.compile(r"\blvl[-_](\d+)\b", re.IGNORECASE)


def ticket_key(branch: str, title: str) -> str:
    """Derive a canonical ticket key. Branch wins over title — branches are set by
    tooling and are more consistent than hand-typed PR titles."""
    for text in (branch, title):
        m = PAD_RE.search(text)
        if m:
            return f"PAD-{int(m.group(1))}"
    for text in (branch, title):
        m = LVL_RE.search(text)
        if m:
            return f"LVL-{int(m.group(1))}"
    # No ticket key. Each such PR must stand alone — bucketing them all under one
    # "UNGROUPED" key would invent a cross-repo pairing between PRs that have nothing
    # to do with each other, which is worse than no grouping at all.
    return f"UNGROUPED:{branch}"


GH_USER = "pedropacheco95"


def gh_env() -> dict:
    """Pin auth to the account that can see BOTH repos.

    `gh auth switch` writes global config, and concurrent sessions on this repo have
    been observed flipping it back to `pedropacheco-berd` mid-run — which cannot
    resolve the private frontend repo at all. Exporting GH_TOKEN for our own
    subprocesses is immune to that churn.
    """
    import os
    env = dict(os.environ)
    if env.get("GH_TOKEN"):
        return env
    tok = subprocess.run(["gh", "auth", "token", "--user", GH_USER],
                         capture_output=True, text=True)
    if tok.returncode == 0 and tok.stdout.strip():
        env["GH_TOKEN"] = tok.stdout.strip()
    return env


def fetch_prs(repo: str, env: dict) -> list:
    out = subprocess.run(
        ["gh", "pr", "list", "--repo", repo, "--state", "open", "--limit", "100",
         "--json", "number,title,headRefName,isDraft,mergeable,updatedAt,url,additions,deletions,files"],
        capture_output=True, text=True, env=env,
    )
    if out.returncode != 0:
        sys.exit(
            f"gh failed for {repo}: {out.stderr.strip()}\n"
            "If this says 'Could not resolve to a Repository', gh is authenticated as an "
            f"account that cannot see the private frontend repo. Fix with:\n"
            f"  export GH_TOKEN=$(gh auth token --user {GH_USER})"
        )
    return json.loads(out.stdout)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated ticket keys to include")
    ap.add_argument("--exclude", help="comma-separated ticket keys to drop")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    args = ap.parse_args()

    only = {t.strip().upper() for t in args.only.split(",")} if args.only else None
    exclude = {t.strip().upper() for t in args.exclude.split(",")} if args.exclude else set()

    env = gh_env()
    groups: dict[str, dict] = {}
    for side, repo in REPOS.items():
        for pr in fetch_prs(repo, env):
            key = ticket_key(pr["headRefName"], pr["title"])
            g = groups.setdefault(key, {"ticket": key, "prs": [], "touches_migrations": False,
                                        "touches_lockfiles": False, "has_draft": False})
            paths = [f["path"] for f in pr.get("files") or []]
            if any(p.startswith("migrations/versions/") for p in paths):
                g["touches_migrations"] = True
            if any(p.endswith(("poetry.lock", "package-lock.json", "pyproject.toml", "package.json")) for p in paths):
                g["touches_lockfiles"] = True
            if pr["isDraft"]:
                g["has_draft"] = True
            g["prs"].append({
                "repo": side, "number": pr["number"], "title": pr["title"],
                "branch": pr["headRefName"], "draft": pr["isDraft"],
                "mergeable": pr["mergeable"], "url": pr["url"],
                "churn": pr["additions"] + pr["deletions"],
                "migration_files": [p for p in paths if p.startswith("migrations/versions/")],
            })

    selected = []
    for key, g in groups.items():
        if only is not None and key not in only:
            continue
        if key in exclude:
            continue
        g["cross_repo"] = len({p["repo"] for p in g["prs"]}) > 1
        selected.append(g)

    # Integration order: smallest churn first so the easy ones land before the tree
    # gets noisy, but every migration-touching ticket goes LAST and consecutively —
    # that way you reconcile Alembic heads once at the end instead of after each merge.
    selected.sort(key=lambda g: (g["touches_migrations"],
                                 sum(p["churn"] for p in g["prs"])))

    if args.json:
        print(json.dumps(selected, indent=2))
        return

    print(f"{len(selected)} ticket(s), "
          f"{sum(len(g['prs']) for g in selected)} PR(s) — in proposed integration order\n")
    for i, g in enumerate(selected, 1):
        flags = []
        if g["cross_repo"]:
            flags.append("CROSS-REPO (atomic)")
        if g["touches_migrations"]:
            flags.append("MIGRATION")
        if g["touches_lockfiles"]:
            flags.append("LOCKFILE")
        if g["has_draft"]:
            flags.append("DRAFT")
        if g["ticket"].startswith("UNGROUPED"):
            flags.append("NO TICKET KEY — confirm scope with user")
        suffix = ("  [" + ", ".join(flags) + "]") if flags else ""
        label = g["ticket"].split(":", 1)[0] if g["ticket"].startswith("UNGROUPED") else g["ticket"]
        print(f"{i:>2}. {label}{suffix}")
        for p in g["prs"]:
            mark = "!" if p["mergeable"] == "CONFLICTING" else " "
            print(f"     {mark} {p['repo']:<8} #{p['number']:<4} {p['branch']:<45} (+{p['churn']} churn)")
            for mf in p["migration_files"]:
                print(f"       └─ {mf}")
    print("\nLegend: '!' = GitHub already reports a conflict against main.")
    print("MIGRATION tickets are ordered last so Alembic heads are reconciled once, at the end.")


if __name__ == "__main__":
    main()
