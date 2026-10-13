"""PAD-654: the Postgres shards together run every collected test exactly once.

Usage: check_shards_cover_suite.py ALL_IDS SHARD_IDS [SHARD_IDS ...]

Each file holds one pytest node id per line: ALL_IDS from a full `--collect-only -q`, each
SHARD_IDS from the session one shard ran (conftest writes it when LEVAPP_SHARD_IDS is set).
Exits 1, naming the ids, when a test is in no shard, in two shards, or in a shard but not the
collection. Stdlib only, like check_alembic_heads.py.
"""
import collections
import sys
from pathlib import Path


def _ids(path):
    return [line.strip() for line in Path(path).read_text(encoding="utf-8").splitlines() if "::" in line]


def check(all_path, shard_paths):
    everything = set(_ids(all_path))
    counts = collections.Counter(i for p in shard_paths for i in _ids(p))
    missing = sorted(everything - set(counts))
    twice = sorted(i for i, n in counts.items() if n > 1)
    unknown = sorted(set(counts) - everything)
    problems = []
    for label, ids in (("in no shard", missing), ("in more than one shard", twice), ("not in the collection", unknown)):
        if ids:
            problems.append(f"{len(ids)} test(s) {label}: " + ", ".join(ids[:20]) + (" ..." if len(ids) > 20 else ""))
    return len(everything), [len(_ids(p)) for p in shard_paths], problems


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    total, per_shard, problems = check(argv[1], argv[2:])
    print(f"collected {total}; shards ran {per_shard} (sum {sum(per_shard)})")
    for line in problems:
        print(f"::error::{line}")
    return 1 if problems or total == 0 else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
