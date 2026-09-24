"""B-173: every git a test runs gets an environment without git's repository variables.

A git hook runs with GIT_DIR (in a worktree, `.git/worktrees/<name>`) and the other
repository-local variables exported. A test that shells out to git inherits them, and GIT_DIR
overrides `git -C <dir>`: `git init <scratch>` then re-initialised the SHARED repository and set
core.bare=true for every worktree on the machine (2026-09-24, 18:22 and 18:38 UTC). A test's git
must find its repository from its own cwd/-C, never from the caller's environment.

    subprocess.run(["git", ...], env=git_env())
    subprocess.run(["bash", script], env=git_env({**os.environ, "X": "1"}))

conftest.py also strips these variables from os.environ at session start; the explicit env is
what keeps a single test safe when run outside that conftest.
"""
import os
import subprocess

# `git rev-parse --local-env-vars` on git 2.4x — the fallback when git cannot be asked.
_KNOWN = frozenset({
    "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT",
    "GIT_OBJECT_DIRECTORY", "GIT_DIR", "GIT_WORK_TREE", "GIT_IMPLICIT_WORK_TREE", "GIT_GRAFT_FILE",
    "GIT_INDEX_FILE", "GIT_NO_REPLACE_OBJECTS", "GIT_REPLACE_REF_BASE", "GIT_PREFIX",
    "GIT_SHALLOW_FILE", "GIT_COMMON_DIR",
})


def _local_env_vars() -> frozenset:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--local-env-vars"],
            cwd="/", capture_output=True, text=True, check=True,
            env={k: v for k, v in os.environ.items() if k not in _KNOWN},
        ).stdout.split()
    except (OSError, subprocess.CalledProcessError):
        out = []
    return _KNOWN | frozenset(out)


GIT_LOCAL_ENV_VARS = _local_env_vars()


def git_env(base=None) -> dict:
    """A copy of ``base`` (default: os.environ) without git's repository-local variables."""
    env = dict(os.environ if base is None else base)
    for name in GIT_LOCAL_ENV_VARS:
        env.pop(name, None)
    return env
