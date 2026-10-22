"""PAD-702 — config and secrets for GKE (``delivery.k8s-manifests`` rules 8-10).

Rule 8: one ConfigMap per environment, generated from the same ``backend/.env.<env>`` the VM reads
plus the deploy's ``vars.env``, with one name in the overlay and in the migrate Job's render.
Rule 9: ``overlays/<env>/sources.txt`` says where every other key comes from and stays equal to the
VM deploy's ``-e`` lines; ``write-config.sh`` builds the Secret's files and the checksum.
Rule 10: every environment key the backend reads is set somewhere, or listed as unset on purpose.
Reads files only: no backend import (the lint job has only pytest and PyYAML).
"""
import ast
import functools
import os
import re
import stat
import subprocess
from pathlib import Path

import pytest

from test_pad698_k8s_manifests import pytestmark  # noqa: F401 — skipped without kubectl, like PAD-698's
from test_pad698_k8s_manifests import ENVS, K8S, REPO, by_kind, container, render

BACKEND = REPO / "backend"
WORKFLOWS = REPO / ".github" / "workflows"
CLASSES_UNSET = {"test", "image", "default", "off", "template-unread"}
#: Deployment env keys that may repeat a template key: the GKE value wins over envFrom.
ALLOWED_OVERRIDES = {"WORKER_SPLIT", "SSE_BROKER", "AUTH_RATE_LIMIT_STORE", "POSTGRES_HOST"}
ENV_CALLS = {"os.getenv", "getenv", "os.environ.get", "environ.get", "env.get"}


# --- the code's keys ---------------------------------------------------------------------------

def keys_read(source: str) -> set:
    """String keys passed to os.getenv / environ.get / env.get / os.environ[...] / config.py's read()."""
    found = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Call) and node.args and isinstance(node.args[0], ast.Constant):
            name = ast.unparse(node.func)
            if (name in ENV_CALLS or name == "read") and isinstance(node.args[0].value, str):
                found.add(node.args[0].value)
        if isinstance(node, ast.Subscript) and ast.unparse(node.value) in ("os.environ", "environ") \
                and isinstance(node.slice, ast.Constant):
            found.add(node.slice.value)
    return {k for k in found if re.fullmatch(r"[A-Z][A-Z0-9_]+", k)}


@functools.lru_cache(maxsize=1)
def backend_keys() -> frozenset:
    files = [p for p in (BACKEND / "padel_app").rglob("*.py") if "tests" not in p.parts]
    files.append(BACKEND / "app.py")
    out = set()
    for p in files:
        out |= keys_read(p.read_text())
    return frozenset(out)


# --- the places a key can be set ---------------------------------------------------------------

def template_keys(env):
    return {line.split("=", 1)[0] for line in (BACKEND / f".env.{env}").read_text().splitlines()
            if re.match(r"[A-Z][A-Z0-9_]*=", line)}


def sources(env):
    rows = {}
    for line in (K8S / "overlays" / env / "sources.txt").read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            key, cls, src = line.split()
            rows[key] = (cls, src)
    return rows


def unset_keys(env):
    rows = {}
    for line in (K8S / "unset-keys.txt").read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            key, envs, cls, reason = line.split(None, 3)
            if envs in ("all", env):
                rows[key] = (cls, reason)
    return rows


def deployment_env(docs):
    out = set()
    for name in ("api", "events", "worker"):
        out |= {e["name"] for e in container(by_kind(docs, "Deployment")[name]).get("env", [])}
    return out


def workflow_e_lines(env):
    text = (WORKFLOWS / f"deploy-{env}.yaml").read_text()
    # The API rollout's docker-run arguments (B-666 made the call `bash "$RO" --name …`).
    seg = text[text.index('bash "$RO" --name'):]
    seg = seg[:seg.index("/levelup_backend")]
    cls = {"secrets": "secret", "vars": "var", "github": "context"}
    return {k: (cls[c], src if c != "github" else f"github.{src}")
            for k, c, src in re.findall(r'-e ([A-Z0-9_]+)="\$\{\{ ([a-z]+)\.([A-Za-z0-9_.]+) \}\}"', seg)}


@pytest.fixture(scope="module", params=list(ENVS))
def env_render(request):
    docs, _ = render(f"overlays/{request.param}")
    return request.param, docs


# --- rule 10: the guard ------------------------------------------------------------------------

def test_every_key_the_backend_reads_is_set_or_unset_on_purpose(env_render):
    env, docs = env_render
    known = template_keys(env) | set(sources(env)) | deployment_env(docs) | set(unset_keys(env))
    missing = sorted(backend_keys() - known)
    assert missing == [], f"{env}: keys read by the backend with no source and no unset-keys.txt line: {missing}"


def test_the_guard_sees_a_new_key():
    assert "PAD702_CANARY" in keys_read('import os\nx = os.getenv("PAD702_CANARY", "1")\n')
    assert "PAD702_CANARY" in keys_read('import os\nx = os.environ["PAD702_CANARY"]\n')
    assert "PAD702_CANARY" in keys_read('def f(env):\n    return env.get("PAD702_CANARY")\n')
    # The scan of the real tree finds keys read each of those ways.
    assert {"FLASK_ENV", "CORS_ALLOWED_ORIGINS", "SSE_MAX_STREAMS"} <= backend_keys()


def test_overrides_are_the_listed_ones(env_render):
    env, docs = env_render
    overrides = deployment_env(docs) & template_keys(env)
    assert overrides <= ALLOWED_OVERRIDES, overrides - ALLOWED_OVERRIDES


def test_unset_keys_are_read_and_explained():
    read = backend_keys()
    for env in ENVS:
        for key, (cls, reason) in unset_keys(env).items():
            assert cls in CLASSES_UNSET, (key, cls)
            assert reason.strip(), key
            if cls == "template-unread":
                assert key in template_keys(env) and key not in read, key
            else:
                assert key in read, f"{key} is listed in unset-keys.txt but nothing reads it"
                assert key not in template_keys(env) and key not in sources(env), f"{key} is set in {env}"


def test_the_gke_deployments_share_one_rate_budget(env_render):
    _, docs = env_render
    for name in ("api", "events", "worker"):
        env = {e["name"]: e.get("value") for e in container(by_kind(docs, "Deployment")[name])["env"]}
        assert env["AUTH_RATE_LIMIT_STORE"] == "database", name


# --- rule 9: sources ---------------------------------------------------------------------------

@pytest.mark.parametrize("env", list(ENVS))
def test_sources_equal_the_vm_deploy(env):
    expected = workflow_e_lines(env)
    expected["POSTGRES_PW"] = ("secret", f"GKE_{env.upper()}_POSTGRES_PW")  # the cluster's own database
    assert sources(env) == expected


def test_prod_keeps_the_signing_keys_of_the_vm():
    rows = sources("prod")
    assert rows["JWT_SECRET_KEY"] == ("secret", "JWT_SECRET_KEY")
    assert rows["FLASK_SECRET_KEY"] == ("secret", "FLASK_SECRET_KEY")


def run_write_config(tmp_path, env, values):
    out, vars_file = tmp_path / "secret", tmp_path / "vars.env"
    environ = {"PATH": os.environ.get("PATH", ""), "VARS_FILE": str(vars_file), **values}
    r = subprocess.run(["bash", str(K8S / "write-config.sh"), env, str(out)], capture_output=True,
                       text=True, timeout=30, env=environ)
    return r, out, vars_file


def all_values(env, **override):
    vals = {k: f"value-of-{k}" for k in sources(env)}
    vals.update(override)
    return vals


def test_write_config_builds_one_private_file_per_secret(tmp_path):
    pem = "-----BEGIN KEY-----\nabc\n-----END KEY-----"
    r, out, vars_file = run_write_config(tmp_path, "prod", all_values("prod", VAPID_PRIVATE_KEY=pem))
    assert r.returncode == 0, r.stderr
    secrets = {k for k, (cls, _) in sources("prod").items() if cls == "secret"}
    assert {p.name for p in out.iterdir()} == secrets
    assert (out / "VAPID_PRIVATE_KEY").read_text() == pem, "a multi-line value survives"
    assert stat.S_IMODE(out.stat().st_mode) == 0o700
    assert all(stat.S_IMODE(p.stat().st_mode) == 0o600 for p in out.iterdir())
    lines = vars_file.read_text().splitlines()
    assert "WORK_GITHUB_REPO=value-of-WORK_GITHUB_REPO" in lines
    assert not any(line.startswith("JWT_SECRET_KEY=") for line in lines), "secrets never reach the ConfigMap"
    assert re.fullmatch(r"secrets-sha256 [0-9a-f]{64}\n", r.stdout)
    assert "value-of" not in r.stdout + r.stderr, "no value is printed"


def test_the_checksum_follows_the_secrets(tmp_path):
    a = run_write_config(tmp_path / "a", "staging", all_values("staging"))[0].stdout
    b = run_write_config(tmp_path / "b", "staging", all_values("staging"))[0].stdout
    c = run_write_config(tmp_path / "c", "staging", all_values("staging", JWT_SECRET_KEY="rotated"))[0].stdout
    d = run_write_config(tmp_path / "d", "staging", all_values("staging", APPLE_CLIENT_IDS="other"))[0].stdout
    assert a == b != c, "a changed secret changes the hash; the same secrets give the same one"
    assert a == d, "a variable is not a secret: it rolls the pods through the ConfigMap's hash instead"


def test_an_empty_secret_fails_by_name(tmp_path):
    r, _, _ = run_write_config(tmp_path, "staging", all_values("staging", JWT_SECRET_KEY="", MAIL_PASSWORD=""))
    assert r.returncode == 1
    assert "JWT_SECRET_KEY" in r.stderr and "MAIL_PASSWORD" in r.stderr
    assert "value-of" not in r.stdout + r.stderr


def test_a_variable_may_not_span_lines(tmp_path):
    r, _, _ = run_write_config(tmp_path, "staging", all_values("staging", APPLE_CLIENT_IDS="a\nb"))
    assert r.returncode == 1 and "APPLE_CLIENT_IDS" in r.stderr


# --- rule 8: the ConfigMap ---------------------------------------------------------------------

@pytest.mark.parametrize("env", list(ENVS))
def test_the_job_and_the_deployments_use_the_same_configmap(env):
    main, _ = render(f"overlays/{env}")
    job, _ = render(f"overlays/{env}/migrate")
    name = [n for n in by_kind(main, "ConfigMap") if n.startswith("levapp-config-")]
    assert len(name) == 1
    assert set(by_kind(job, "ConfigMap")) == set(name), "same inputs, same hash, in both builds"
    job_ref = by_kind(job, "Job")["migrate"]["spec"]["template"]["spec"]["containers"][0]["envFrom"][0]
    assert job_ref["configMapRef"]["name"] == name[0]
    for d in ("api", "events", "worker"):
        assert container(by_kind(main, "Deployment")[d])["envFrom"][0]["configMapRef"]["name"] == name[0]


@pytest.mark.parametrize("env", list(ENVS))
def test_the_configmap_is_the_vm_template_plus_vars(env):
    docs, _ = render(f"overlays/{env}")
    data = next(d for d in docs if d["kind"] == "ConfigMap")["data"]
    assert set(data) == template_keys(env), "vars.env is empty here; the deploy fills it"
    assert not set(data) & {k for k, (c, _) in sources(env).items() if c == "secret"}


def test_vars_env_is_never_committed():
    ignore = (REPO / ".gitignore").read_text().splitlines()
    assert "infra/k8s/overlays/*/config/vars.env" in ignore


def test_the_secret_rolls_the_pods(env_render):
    _, docs = env_render
    for name in ("api", "events", "worker"):
        ann = by_kind(docs, "Deployment")[name]["spec"]["template"]["metadata"]["annotations"]
        assert ann["levapp.app/secrets-sha256"] == "SECRETS_SHA256", "the placeholder the workflow fills"


def test_every_render_reads_the_template_with_the_load_restrictor_off():
    wf = (WORKFLOWS / "k8s-lint.yaml").read_text()
    assert wf.count("--load-restrictor LoadRestrictionsNone") >= 1
    assert "touch overlays/staging/config/vars.env overlays/prod/config/vars.env" in wf


@pytest.mark.parametrize("name", ["api", "events"])
def test_the_thread_count_follows_the_configmap(name):
    """PAD-689 sets GUNICORN_THREADS in the template (160 on staging, for 120 streams); a fixed
    --threads in the manifests would leave the cap without its threads."""
    import shlex
    import subprocess as sp

    docs, _ = render("overlays/staging")
    script = container(by_kind(docs, "Deployment")[name])["args"][2]
    assert '--threads "${GUNICORN_THREADS:-64}"' in script
    for env, expected in (({"GUNICORN_THREADS": "160"}, "160"), ({}, "64")):
        out = sp.run(["sh", "-c", script.replace("exec gunicorn", "printf '%s\\n' gunicorn", 1)],
                     capture_output=True, text=True, env={"PATH": os.environ.get("PATH", ""), **env}).stdout.split()
        assert out[out.index("--threads") + 1] == expected
        fmt = out[out.index("--access-logformat") + 1:out.index("app:run_app")]
        assert " ".join(fmt) == '%(m)s %(U)s %(s)s %(L)s "%(a)s"'
