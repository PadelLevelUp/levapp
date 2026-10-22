"""PAD-698 — `infra/k8s` renders what the spec says (``delivery.k8s-manifests``).

Reads the output of ``kubectl kustomize`` for both overlays and both migrate kustomizations (the
same renders the ``k8s-lint`` workflow validates with kubeconform) and checks the rules a schema
cannot: roles and commands, the probe matrix, every host's routes, the backend timeouts, load
balancer logging, the migrate Job's shape, and that no project identifier is tracked (R-036).
Skipped when kubectl is absent; the CI job installs it.
"""
import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest
import yaml

K8S = Path(__file__).resolve().parents[3] / "infra" / "k8s"

pytestmark = pytest.mark.skipif(shutil.which("kubectl") is None, reason="kubectl renders the kustomizations")

ENVS = {
    "staging": {
        "namespace": "staging-levapp",
        "app": ["staging.levapp.app"],
        "api": ["api.staging.levapp.app"],
        "admin": ["admin.staging.levapp.app"],
        "legacy": None,
    },
    "prod": {
        "namespace": "levapp",
        "app": ["levapp.app", "www.levapp.app"],
        "api": ["api.levapp.app"],
        "admin": ["admin.levapp.app"],
        "legacy": ["padellevelup.com", "www.padellevelup.com"],
    },
}


def render(path):
    # Rendering reads only files: no kubeconfig, no cluster (B-173: never the inherited environment).
    env = {"PATH": os.environ.get("PATH", ""), "HOME": os.environ.get("HOME", "/tmp"), "KUBECONFIG": os.devnull}
    out = subprocess.run(["kubectl", "kustomize", str(K8S / path)], capture_output=True, text=True,
                         check=True, timeout=60, env=env).stdout
    return [d for d in yaml.safe_load_all(out) if d], out


def by_kind(docs, kind):
    return {d["metadata"]["name"]: d for d in docs if d["kind"] == kind}


def container(deploy):
    return deploy["spec"]["template"]["spec"]["containers"][0]


def env_of(c):
    return {e["name"]: e.get("value") for e in c.get("env", [])}


@pytest.fixture(scope="module", params=list(ENVS))
def overlay(request):
    docs, text = render(f"overlays/{request.param}")
    return request.param, docs, text


# --- rule 1: workloads and roles ---------------------------------------------------------------

def test_every_workload_is_in_the_environment_namespace(overlay):
    env, docs, _ = overlay
    ns = ENVS[env]["namespace"]
    assert by_kind(docs, "Namespace").keys() == {ns}
    for d in docs:
        if d["kind"] != "Namespace":
            assert d["metadata"]["namespace"] == ns, (d["kind"], d["metadata"]["name"])
    assert set(by_kind(docs, "Deployment")) == {"api", "events", "worker", "web", "admin"}
    assert "Job" not in {d["kind"] for d in docs}, "the migrate Job is its own kustomization (rule 5)"


def test_backend_roles_run_through_the_entrypoint(overlay):
    _, docs, _ = overlay
    deps = by_kind(docs, "Deployment")
    for name, role in (("api", "api"), ("events", "events"), ("worker", "worker")):
        c = container(deps[name])
        assert "command" not in c, f"{name}: command would bypass the schema boot gate (entrypoint.sh)"
        env = env_of(c)
        assert env["ROLE"] == role
        assert env["WORKER_SPLIT"] == "on" and env["SSE_BROKER"] == "postgres"
        assert c["image"].startswith("REGISTRY/levelup_backend:")
        assert c["envFrom"][0]["configMapRef"]["name"] == "levapp-config"
        assert c["envFrom"][1]["secretRef"]["name"] == "levapp-secrets"
    assert container(deps["worker"])["args"] == ["python", "-m", "padel_app.worker"]
    assert container(deps["api"])["args"][0] == "gunicorn"


def test_rollouts_overlap_except_the_worker(overlay):
    _, docs, _ = overlay
    deps = by_kind(docs, "Deployment")
    for name in ("api", "events", "web", "admin"):
        s = deps[name]["spec"]["strategy"]
        assert s["type"] == "RollingUpdate" and s["rollingUpdate"] == {"maxSurge": 1, "maxUnavailable": 0}, name
    assert deps["worker"]["spec"]["strategy"] == {"type": "Recreate"}
    assert all(d["spec"]["replicas"] == 1 for d in deps.values()), "replicas: 2 waits for B8 (PAD-704)"


def test_the_api_access_log_carries_no_query_string(overlay):
    _, docs, _ = overlay
    for name in ("api", "events"):
        args = container(by_kind(docs, "Deployment")[name])["args"]
        fmt = args[args.index("--access-logformat") + 1]
        assert "%(U)s" in fmt
        for leak in ("%(q)s", "%(r)s", "%(f)s", "%(h)s"):  # query, request line, referer, address
            assert leak not in fmt, (name, leak)


# --- rule 2: probes ----------------------------------------------------------------------------

def probe(c, kind):
    p = c[kind]
    return (p["httpGet"]["path"], p["periodSeconds"], p["failureThreshold"])


def test_the_probe_matrix(overlay):
    _, docs, _ = overlay
    deps = by_kind(docs, "Deployment")
    for name in ("api", "events"):
        c = container(deps[name])
        assert probe(c, "startupProbe") == ("/api/app/healthz", 5, 60)
        assert probe(c, "readinessProbe") == ("/api/app/healthz", 10, 3)
        assert probe(c, "livenessProbe") == ("/api/app/livez", 20, 3)
        assert c["lifecycle"]["preStop"]["exec"]["command"] == ["sleep", "10"]
    w = container(deps["worker"])
    assert probe(w, "livenessProbe") == ("/livez", 20, 3)
    assert w["livenessProbe"]["httpGet"]["port"] == "livez"
    assert {"name": "livez", "containerPort": 8081} in w["ports"]
    assert "readinessProbe" not in w, "the worker serves nothing"
    assert deps["worker"]["spec"]["template"]["spec"]["terminationGracePeriodSeconds"] >= 60


# --- rule 3: Gateway and routes ----------------------------------------------------------------

def rules_of(route):
    out = {}
    for r in route["spec"]["rules"]:
        path = r["matches"][0]["path"]["value"] if r.get("matches") else "*"
        out[path] = r
    return out


def backend(rule):
    return rule["backendRefs"][0]["name"] if rule.get("backendRefs") else None


def headers(rule):
    for f in rule.get("filters", []):
        if f["type"] == "ResponseHeaderModifier":
            return {h["name"]: h["value"] for h in f["responseHeaderModifier"]["set"]}
    return {}


def test_the_gateway_takes_its_certificates_and_address_from_terraform(overlay):
    env, docs, _ = overlay
    gw = by_kind(docs, "Gateway")["levapp"]
    assert gw["spec"]["gatewayClassName"] == "gke-l7-global-external-managed"
    assert gw["metadata"]["annotations"]["networking.gke.io/certmap"] == f"levapp-{env}"
    assert gw["spec"]["addresses"] == [{"type": "NamedAddress", "value": f"levapp-{env}-gateway"}]
    assert "ManagedCertificate" not in {d["kind"] for d in docs}


def test_each_host_routes_like_its_vm_vhost(overlay):
    env, docs, _ = overlay
    routes = by_kind(docs, "HTTPRoute")
    app, api, admin = rules_of(routes["app"]), rules_of(routes["api-host"]), rules_of(routes["admin"])
    assert routes["app"]["spec"]["hostnames"] == ENVS[env]["app"]
    assert routes["api-host"]["spec"]["hostnames"] == ENVS[env]["api"]
    assert routes["admin"]["spec"]["hostnames"] == ENVS[env]["admin"]
    assert {p: backend(r) for p, r in app.items()} == {
        "/api/app/events": "events", "/api/": "api", "/register/": "web", "/": "web"}
    assert {p: backend(r) for p, r in api.items()} == {"/api/app/events": "events", "/api/": "api"}, \
        "the api host serves the API only; anything else is unmatched (404)"
    assert {p: backend(r) for p, r in admin.items()} == {"/admin/api/": "api", "/": "admin"}
    assert headers(app["/register/"])["Referrer-Policy"] == "no-referrer"


def test_every_host_that_serves_the_api_routes_events_to_the_long_timeout(overlay):
    _, docs, _ = overlay
    for name, route in by_kind(docs, "HTTPRoute").items():
        rules = rules_of(route)
        if "/api/" in rules:
            assert backend(rules.get("/api/app/events", {})) == "events", name
    policies = by_kind(docs, "GCPBackendPolicy")
    assert policies["events"]["spec"]["default"]["timeoutSec"] == 3600
    assert policies["api"]["spec"]["default"]["timeoutSec"] == 60


def test_every_https_rule_sets_hsts_and_http_redirects(overlay):
    env, docs, _ = overlay
    routes = by_kind(docs, "HTTPRoute")
    all_hosts = set()
    for name, route in routes.items():
        if route["spec"]["parentRefs"][0]["sectionName"] != "https":
            continue
        all_hosts.update(route["spec"]["hostnames"])
        for path, rule in rules_of(route).items():
            if rule.get("backendRefs"):
                assert headers(rule).get("Strict-Transport-Security") == "max-age=31536000", (name, path)
    redirect = routes["http-redirect"]
    assert set(redirect["spec"]["hostnames"]) == all_hosts
    assert redirect["spec"]["rules"][0]["filters"][0]["requestRedirect"] == {"scheme": "https", "statusCode": 301}


def test_the_old_domain_serves_the_api_and_redirects_the_rest(overlay):
    env, docs, _ = overlay
    routes = by_kind(docs, "HTTPRoute")
    if ENVS[env]["legacy"] is None:
        assert "legacy-domain" not in routes
        return
    legacy = routes["legacy-domain"]
    assert legacy["spec"]["hostnames"] == ENVS[env]["legacy"]
    rules = rules_of(legacy)
    assert {p: backend(r) for p, r in rules.items()} == {
        "/api/app/events": "events", "/api/": "api", "/.well-known/": "web", "/": None}
    assert rules["/"]["filters"][0]["requestRedirect"] == {"scheme": "https", "hostname": "levapp.app", "statusCode": 301}


# --- rule 4: logging, health checks ------------------------------------------------------------

def test_load_balancer_logging_is_off_on_every_backend(overlay):
    _, docs, _ = overlay
    policies = by_kind(docs, "GCPBackendPolicy")
    services = by_kind(docs, "Service")
    assert set(policies) == set(services)
    for name, p in policies.items():
        assert p["spec"]["default"]["logging"] == {"enabled": False}, name
        assert p["spec"]["targetRef"] == {"group": "", "kind": "Service", "name": name}


def test_the_load_balancer_checks_readiness(overlay):
    _, docs, _ = overlay
    checks = {n: p["spec"]["default"]["config"]["httpHealthCheck"]["requestPath"]
              for n, p in by_kind(docs, "HealthCheckPolicy").items()}
    assert checks == {"api": "/api/app/healthz", "events": "/api/app/healthz", "web": "/", "admin": "/"}


# --- rule 5: the migrate Job -------------------------------------------------------------------

@pytest.mark.parametrize("env", list(ENVS))
def test_the_migrate_job_is_its_own_kustomization(env):
    docs, _ = render(f"overlays/{env}/migrate")
    assert [d["kind"] for d in docs] == ["Job"]
    job = docs[0]
    assert job["metadata"]["namespace"] == ENVS[env]["namespace"]
    spec = job["spec"]
    assert spec["backoffLimit"] == 0
    assert spec["activeDeadlineSeconds"] == 1800, "MIGRATE_LOCK_TIMEOUT 1500 + 300"
    assert spec["ttlSecondsAfterFinished"] == 86400
    c = spec["template"]["spec"]["containers"][0]
    assert "command" not in c and c["args"] == ["/app/scripts/migrate.sh"]
    assert c["image"].startswith("REGISTRY/levelup_backend:")
    assert spec["template"]["spec"]["restartPolicy"] == "Never"


# --- rule 6: no identifiers (R-036) ------------------------------------------------------------

PROJECT_SHAPES = [
    r"\.iam\.gserviceaccount\.com",
    r"-docker\.pkg\.dev",
    r"gcr\.io/",
    r"projects/[a-z]",
    r"\b(europe|us|asia)-[a-z]+\d-[a-z]\b",  # a zone
]


@pytest.mark.parametrize("path", ["overlays/staging", "overlays/prod", "overlays/staging/migrate", "overlays/prod/migrate"])
def test_no_project_identifier_is_tracked(path):
    _, text = render(path)
    for shape in PROJECT_SHAPES:
        assert not re.search(shape, text), shape
    assert "GSA_BACKEND" in text or path.endswith("migrate"), "the Workload Identity annotation stays a placeholder"


# --- rule 7: the CI job ------------------------------------------------------------------------

def test_the_lint_workflow_validates_every_kustomization_with_schemas():
    wf = (K8S.parents[1] / ".github" / "workflows" / "k8s-lint.yaml").read_text()
    yaml.safe_load(wf)
    for path in ("overlays/staging", "overlays/prod", "overlays/staging/migrate", "overlays/prod/migrate"):
        assert path in wf
    assert "kubeconform" in wf and "-strict" in wf
    assert "-ignore-missing-schemas" not in wf, "a resource with no schema must fail, not pass"
    assert re.search(r"CRDs-catalog/[0-9a-f]{40}/", wf), "the CRD catalog is pinned to a commit"
    assert "test_pad698_k8s_manifests.py" in wf
