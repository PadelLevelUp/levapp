"""PAD-654: the Postgres lane runs as two pytest-split shards, and CI checks they cover the suite.

`scripts/check_shards_cover_suite.py` compares each shard's selected ids with a full collection: a
test in no shard, in two shards, or unknown to the collection fails the `shards` job. Covers
delivery.backend-ci-lanes rule 3 and "The shards run every test exactly once".
"""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "check_shards_cover_suite.py"
spec = importlib.util.spec_from_file_location("check_shards_cover_suite", SCRIPT)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

ALL = ["a.py::t1", "a.py::t2", "b.py::t3", "b.py::T::t4"]


def _write(tmp_path, name, ids):
    path = tmp_path / name
    path.write_text("".join(f"{i}\n" for i in ids) + "4 tests collected in 0.1s\n", encoding="utf-8")
    return str(path)


def _run(tmp_path, *shards):
    return checker.main(["check", _write(tmp_path, "all.txt", ALL), *(_write(tmp_path, f"s{n}.txt", s) for n, s in enumerate(shards))])


def test_two_shards_that_partition_the_collection_pass(tmp_path, capsys):
    assert _run(tmp_path, ALL[:2], ALL[2:]) == 0
    assert "collected 4; shards ran [2, 2] (sum 4)" in capsys.readouterr().out


def test_a_test_in_no_shard_fails_and_is_named(tmp_path, capsys):
    assert _run(tmp_path, ALL[:2], ALL[3:]) == 1
    assert "1 test(s) in no shard: b.py::t3" in capsys.readouterr().out


def test_a_test_in_both_shards_fails_even_when_the_sum_matches(tmp_path, capsys):
    assert _run(tmp_path, ALL[:3], ALL[2:3]) == 1  # t4 missing, t3 twice: 4 ids, wrong ones
    out = capsys.readouterr().out
    assert "in more than one shard: b.py::t3" in out and "in no shard: b.py::T::t4" in out


def test_an_id_the_collection_does_not_know_fails(tmp_path, capsys):
    assert _run(tmp_path, ALL[:2], [*ALL[2:], "c.py::ghost"]) == 1
    assert "not in the collection: c.py::ghost" in capsys.readouterr().out


def test_an_empty_collection_never_passes(tmp_path):
    assert checker.main(["check", _write(tmp_path, "all.txt", []), _write(tmp_path, "s.txt", [])]) == 1
