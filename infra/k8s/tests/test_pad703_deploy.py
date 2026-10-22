"""PAD-703 — the GKE deploy workflow and its scripts (``delivery.k8s-manifests`` rule 11).

No cluster: the workflows are checked by shape, and render.sh, migrate-job.sh and smoke.sh run
against a stub kubectl / curl (R-028 harness). The first real run is PAD-705's.
"""
import os
import re
import stat
import subprocess

import pytest
import yaml

from test_pad698_k8s_manifests import pytestmark  # noqa: F401 — skipped without kubectl, like PAD-698's
from test_pad698_k8s_manifests import ENVS, K8S, REPO, by_kind, render
from test_pad702_config import sources

WF = REPO / ".github" / "workflows"


def workflow(name):
    data = yaml.safe_load((WF / name).read_text())
    data["on"] = data.pop(True, data.get("on"))  # YAML 1.1 reads `on:` as True
    return data


def steps():
    return workflow("_deploy-gke.yaml")["jobs"]["deploy"]["steps"]


def step(name):
    return next(s for s in steps() if s.get("name") == name)


def index_of(predicate):
    return next(i for i, s in enumerate(steps()) if predicate(s))


# --- the workflows -----------------------------------------------------------------------------

def test_dispatch_only_never_cancelled_and_one_reusable_job():
    wf = workflow("deploy-gke.yaml")
    assert set(wf["on"]) == {"workflow_dispatch"}, "push triggers join in PAD-705 / PAD-708"
    assert wf["on"]["workflow_dispatch"]["inputs"]["environment"]["options"] == ["staging", "prod"]
    assert wf["concurrency"]["cancel-in-progress"] is False
    job = wf["jobs"]["deploy"]
    assert job["uses"] == "./.github/workflows/_deploy-gke.yaml" and job["secrets"] == "inherit"
    assert job["with"]["image_tag"] == "${{ inputs.image_tag || github.sha }}"


def test_the_job_runs_as_the_environment_with_federated_identity():
    job = workflow("_deploy-gke.yaml")["jobs"]["deploy"]
    assert job["environment"] == "${{ inputs.environment }}"
    assert job["permissions"] == {"contents": "read", "id-token": "write"}
    auth = next(s for s in steps() if str(s.get("uses", "")).startswith("google-github-actions/auth@"))
    assert set(auth["with"]) == {"workload_identity_provider", "service_account"}
    assert all(v.startswith("${{ vars.") for v in auth["with"].values()), "no key file, no identifier"
    creds = next(s for s in steps() if str(s.get("uses", "")).startswith("google-github-actions/get-gke-credentials@"))
    assert all(v.startswith("${{ vars.") for v in creds["with"].values())


def test_the_order_of_the_steps():
    first = index_of(lambda s: s.get("name") == "The tag is on the environment's branch")
    login = index_of(lambda s: s.get("name") == "Log in to Docker Hub")
    images = index_of(lambda s: s.get("name") == "The images exist at the tag")
    migrate = index_of(lambda s: s.get("name") == "Migrate")
    apply = index_of(lambda s: s.get("name") == "Apply and wait for the rollouts")
    smoke = index_of(lambda s: s.get("name") == "Smoke")
    assert first == 1, "after checkout, before anything else"
    assert first < login < images < migrate < apply < smoke
    branch_check = step("The tag is on the environment's branch")["run"]
    assert "staging) branch=staging" in branch_check and "prod) branch=main" in branch_check
    assert 'git merge-base --is-ancestor "$sha" "origin/$branch"' in branch_check
    assert "bash infra/k8s/migrate-job.sh" in step("Migrate")["run"]


@pytest.mark.parametrize("env", list(ENVS))
def test_each_environment_maps_its_own_github_names(env):
    block = step(f"Secrets and variables ({env})")
    assert block["if"] == f"inputs.environment == '{env}'"
    expected = {}
    for key, (cls, src) in sources(env).items():
        expected[key] = "${{ " + {"secret": f"secrets.{src}", "var": f"vars.{src}", "context": src}[cls] + " }}"
    assert block["env"] == expected
    for value in block["env"].values():
        assert "||" not in value and "&&" not in value, "an empty prod secret must never fall through"
    assert block["run"].startswith(f"bash infra/k8s/write-config.sh {env} ")


def test_no_secret_is_written_into_a_script():
    for s in steps():
        assert "${{ secrets." not in s.get("run", ""), s.get("name")


def test_staging_builds_push_the_commit_tag():
    text = (WF / "deploy-staging.yaml").read_text()
    for image in ("levelup_backend", "levelup_frontend", "levelup_admin"):
        assert f"${{{{ secrets.DOCKERHUB_USERNAME }}}}/{image}:${{{{ github.sha }}}}" in text, image
        assert f"${{{{ secrets.DOCKERHUB_USERNAME }}}}/{image}:staging" in text, image


# --- pull credentials --------------------------------------------------------------------------

@pytest.mark.parametrize("env", list(ENVS))
def test_every_pod_pulls_with_the_registry_secret(env):
    main, _ = render(f"overlays/{env}")
    job, _ = render(f"overlays/{env}/migrate")
    accounts = by_kind(main, "ServiceAccount")
    for docs in (main, job):
        for d in docs:
            if d["kind"] in ("Deployment", "Job"):
                sa = d["spec"]["template"]["spec"].get("serviceAccountName")
                assert sa in accounts, (d["metadata"]["name"], sa)
                assert accounts[sa]["imagePullSecrets"] == [{"name": "levapp-registry"}], sa
    assert step("Namespace and registry pull Secret")["env"]["DOCKERHUB_PASSWORD"] == "${{ secrets.DOCKERHUB_PASSWORD }}"


# --- render.sh ---------------------------------------------------------------------------------

def run_render(env, part, **values):
    environ = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", "/tmp"),
               "KUBECONFIG": os.devnull, **values}
    return subprocess.run(["bash", str(K8S / "render.sh"), env, part], capture_output=True, text=True,
                          timeout=60, env=environ)


GOOD = {"REGISTRY": "docker.io/someone", "IMAGE_TAG": "0123abc", "GSA_BACKEND": "deployer@example.invalid",
        "SECRETS_SHA256": "deadbeef"}


@pytest.mark.parametrize("env", list(ENVS))
def test_render_fills_every_placeholder(env):
    r = run_render(env, "app", **GOOD)
    assert r.returncode == 0, r.stderr
    docs = [d for d in yaml.safe_load_all(r.stdout) if d]
    images = {c["image"] for d in docs if d["kind"] == "Deployment" for c in d["spec"]["template"]["spec"]["containers"]}
    assert images == {f"docker.io/someone/{i}:0123abc" for i in ("levelup_backend", "levelup_frontend", "levelup_admin")}
    assert by_kind(docs, "ServiceAccount")["levapp-backend"]["metadata"]["annotations"] == \
        {"iam.gke.io/gcp-service-account": "deployer@example.invalid"}
    for d in ("api", "events", "worker"):
        ann = by_kind(docs, "Deployment")[d]["spec"]["template"]["metadata"]["annotations"]
        assert ann["levapp.app/secrets-sha256"] == "deadbeef"
    job = run_render(env, "migrate", **{k: v for k, v in GOOD.items() if k != "SECRETS_SHA256"})
    assert job.returncode == 0 and "docker.io/someone/levelup_backend:0123abc" in job.stdout


@pytest.mark.parametrize("missing", ["REGISTRY", "IMAGE_TAG", "GSA_BACKEND", "SECRETS_SHA256"])
def test_render_refuses_a_missing_value(missing):
    r = run_render("staging", "app", **{k: v for k, v in GOOD.items() if k != missing})
    assert r.returncode == 1 and missing in r.stderr and r.stdout == ""


def test_render_refuses_a_value_that_could_break_the_substitution():
    r = run_render("staging", "app", **{**GOOD, "IMAGE_TAG": "abc|rm"})
    assert r.returncode == 1 and "IMAGE_TAG is malformed" in r.stderr


# --- migrate-job.sh ----------------------------------------------------------------------------

KUBECTL_STUB = r"""#!/usr/bin/env bash
# kubectl -n NS <verb> ...: the Job's state lives in $STUB/job (absent | active | Complete | Failed)
echo "kubectl $*" >> "$STUB/calls.log"
shift 2
state=$(cat "$STUB/job" 2>/dev/null || echo absent)
case "$1 $2" in
  "get job")
    [ "$state" = absent ] && exit 1
    case "$*" in
      *status.active*)
        if [ "$state" = active ]; then
          n=$(cat "$STUB/active_polls" 2>/dev/null || echo 0); echo $((n+1)) > "$STUB/active_polls"
          if [ "$n" -ge "${STUB_ACTIVE_FOR:-0}" ]; then echo Complete > "$STUB/job"; echo 0; else echo 1; fi
        fi ;;
      *conditions*) [ "$state" = Complete ] && echo "Complete "; [ "$state" = Failed ] && echo "Failed " ;;
    esac ;;
  "delete job") rm -f "$STUB/job" ;;
  "apply -f") echo "${STUB_OUTCOME:-Complete}" > "$STUB/job" ;;
  "logs job/migrate") echo "[migrate] stub log" ;;
esac
exit 0
"""


@pytest.fixture
def stub(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    for name, body in (("kubectl", KUBECTL_STUB), ("sleep", "#!/usr/bin/env bash\necho \"sleep $*\" >> \"$STUB/calls.log\"\n")):
        p = bin_dir / name
        p.write_text(body)
        p.chmod(p.stat().st_mode | stat.S_IEXEC)
    (tmp_path / "migrate.yaml").write_text("kind: Job\n")

    def run(**env):
        environ = {"PATH": f"{bin_dir}:{os.environ['PATH']}", "STUB": str(tmp_path), "POLL": "5", **env}
        r = subprocess.run(["bash", str(K8S / "migrate-job.sh"), "staging-levapp", str(tmp_path / "migrate.yaml")],
                           capture_output=True, text=True, timeout=30, env=environ)
        calls = (tmp_path / "calls.log").read_text().splitlines() if (tmp_path / "calls.log").exists() else []
        return r, calls

    run.dir = tmp_path
    return run


def first(calls, text):
    return next(i for i, c in enumerate(calls) if text in c)


def test_a_complete_job_passes_and_its_log_is_printed(stub):
    r, calls = stub()
    assert r.returncode == 0, r.stdout
    assert first(calls, "delete job migrate") < first(calls, "apply -f")
    assert "[migrate] stub log" in r.stdout and "complete" in r.stdout


def test_a_failed_job_fails_at_once_with_its_log(stub):
    r, calls = stub(STUB_OUTCOME="Failed")
    assert r.returncode == 1
    assert "[migrate] stub log" in r.stdout and "the migrate Job failed" in r.stdout
    assert not [c for c in calls if c.startswith("sleep")], "Failed is seen on the first poll, not after a timeout"


def test_a_running_job_is_waited_for_never_deleted_while_active(stub):
    (stub.dir / "job").write_text("active")
    r, calls = stub(STUB_ACTIVE_FOR="3")
    assert r.returncode == 0, r.stdout
    assert "still running: waiting" in r.stdout
    assert first(calls, "sleep") < first(calls, "delete job migrate")


def test_a_job_running_too_long_is_left_alone(stub):
    (stub.dir / "job").write_text("active")
    r, calls = stub(STUB_ACTIVE_FOR="999", ACTIVE_WAIT="15")
    assert r.returncode == 1 and "not deleting it" in r.stdout
    assert not any("delete job" in c for c in calls)


def test_a_job_that_never_finishes_times_out_with_its_log(stub):
    r, _ = stub(STUB_OUTCOME="active", JOB_TIMEOUT="15")
    assert r.returncode == 1 and "did not finish within 15s" in r.stdout and "[migrate] stub log" in r.stdout


# --- smoke.sh ----------------------------------------------------------------------------------

CURL_STUB = r"""#!/usr/bin/env bash
# Answers by URL; -w '%{http_code}', '%{content_type}' or '%{http_code} %{redirect_url}'.
url="${@: -1}"; fmt=""; prev=""
for a in "$@"; do [ "$prev" = "-w" ] && fmt="$a"; prev="$a"; done
case "$url" in
  */api/app/healthz) code="${STUB_HEALTHZ:-200}" ;;
  http://*) code=301; redirect="https://${url#http://}" ;;
  *) code=200 ;;
esac
ctype="text/html"; case "$url" in *apple-app-site-association) ctype="${STUB_AASA_TYPE:-application/json}" ;; esac
out="${fmt//%\{http_code\}/$code}"; out="${out//%\{content_type\}/$ctype}"; out="${out//%\{redirect_url\}/${redirect:-}}"
printf '%s' "$out"
"""


def smoke(tmp_path, **env):
    curl = tmp_path / "curl"
    curl.write_text(CURL_STUB)
    curl.chmod(curl.stat().st_mode | stat.S_IEXEC)
    environ = {"PATH": os.environ.get("PATH", ""), "CURL": str(curl), **env}
    return subprocess.run(["bash", str(K8S / "smoke.sh"), "https://staging.levapp.app", "https://api.staging.levapp.app"],
                          capture_output=True, text=True, timeout=30, env=environ)


def test_smoke_passes_on_a_healthy_environment_without_an_account(tmp_path):
    r = smoke(tmp_path)
    assert r.returncode == 0, r.stdout
    for check in ("healthz", "livez", "web root", "AASA is application/json", "HTTP redirects to HTTPS"):
        assert f"PASS {check}" in r.stdout
    assert "SKIP signed-in checks" in r.stdout


def test_smoke_fails_on_an_unready_api(tmp_path):
    r = smoke(tmp_path, STUB_HEALTHZ="503")
    assert r.returncode == 1 and "FAIL healthz" in r.stdout


def test_smoke_fails_when_the_aasa_is_not_json(tmp_path):
    r = smoke(tmp_path, STUB_AASA_TYPE="application/octet-stream")
    assert r.returncode == 1 and "FAIL AASA" in r.stdout
