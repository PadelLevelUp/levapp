"""PAD-355: the Google Play bundle job in android-build.yaml (mobile.android-play-bundle).

Read as YAML, like the other workflow guards. Covers the criteria "A dispatch for Play builds only
the bundle", "The upload key never reaches a pull request" and "The name says NOT-FOR-PLAY": the
`aab` job never runs on the schedule, a dispatch with `aab` skips the emulator APK (and so Maestro),
all four ABIs are built, the keystore is decoded on a dispatch only, and a debug-signed bundle is
named NOT-FOR-PLAY while an upload-signed one with a debug signer fails the job.
"""
import pathlib
import re

import yaml

WORKFLOW = pathlib.Path(__file__).resolve().parents[3] / ".github" / "workflows" / "android-build.yaml"


def _doc():
    return yaml.safe_load(WORKFLOW.read_text())


def _step(job, name_prefix):
    matches = [s for s in job["steps"] if s.get("name", "").startswith(name_prefix)]
    assert len(matches) == 1, f"expected one step named {name_prefix!r}, found {len(matches)}"
    return matches[0]


def test_the_dispatch_declares_the_bundle_inputs():
    inputs = _doc()[True]["workflow_dispatch"]["inputs"]  # PyYAML reads `on:` as True
    assert inputs["aab"]["type"] == "boolean" and inputs["aab"]["default"] is False
    assert inputs["require_upload_key"]["type"] == "boolean"
    assert inputs["version_code"]["type"] == "string"
    assert inputs["target"]["options"] == ["production", "staging"]
    assert inputs["target"]["default"] == "production"


def test_a_dispatch_for_play_builds_only_the_bundle():
    jobs = _doc()["jobs"]
    assert jobs["apk"]["if"] == "${{ !(github.event_name == 'workflow_dispatch' && inputs.aab) }}"
    # Maestro and the lane check hang off the APK job, so skipping it skips them.
    assert jobs["maestro"]["needs"] == "apk"
    assert "needs.apk.result == 'success'" in jobs["lane-result"]["if"]
    aab_if = jobs["aab"]["if"]
    assert "pull_request" in aab_if and "workflow_dispatch' && inputs.aab" in aab_if
    assert "schedule" not in aab_if


def test_the_bundle_is_built_for_all_four_abis():
    step = _step(_doc()["jobs"]["aab"], "Gradle bundleRelease")
    assert step["run"].startswith("./gradlew bundleRelease")
    assert "reactNativeArchitectures" not in step["run"]


def test_the_store_prebuild_has_no_ci_flag_and_is_checked():
    step = _step(_doc()["jobs"]["aab"], "Store prebuild")
    assert "LEVAPP_CI_APK" not in step.get("env", {})
    assert "usesCleartextTraffic" in step["run"]
    assert "PAD-355: upload-key signing" in step["run"]


def test_the_upload_key_never_reaches_a_pull_request():
    job = _doc()["jobs"]["aab"]
    script = _step(job, "Upload key and Firebase config")["run"]
    guard = script.index('[ "$GITHUB_EVENT_NAME" = workflow_dispatch ]')
    assert guard < script.index("upload.jks"), "the keystore must be decoded only under the dispatch guard"
    for step in job["steps"]:
        run = step.get("run", "")
        assert not re.search(r"\$\{\{\s*(secrets|inputs)\.", run), f"{step.get('name')} splices a secret or input into its script"
    cleanup = _step(job, "Remove the keystore")
    assert cleanup["if"] == "always()" and "upload.jks" in cleanup["run"]


def test_the_artefact_name_says_not_for_play():
    job = _doc()["jobs"]["aab"]
    script = _step(job, "Bundle check, signer and summary")["run"]
    assert 'name="levapp-android-aab-NOT-FOR-PLAY-debug-signed"' in script
    assert 'name="levapp-android-aab-$VERSION_NAME-$VERSION_CODE"' in script
    assert 'grep -q "Android Debug"' in script and "exit 1" in script
    assert "verify-release-bundle.mjs" in script and "keytool -printcert -jarfile" in script
    upload = [s for s in job["steps"] if s.get("uses", "").startswith("actions/upload-artifact")]
    assert len(upload) == 1 and upload[0]["with"]["name"] == "${{ steps.summary.outputs.artifact }}"
