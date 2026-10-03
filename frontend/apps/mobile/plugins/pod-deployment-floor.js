/**
 * PAD-467 (mobile.release-build-target rule 3b): the pure half of `with-pod-deployment-floor`.
 *
 * Xcode 27 rejects a pod whose deployment target is below the iOS 27 SDK's range (15.0+): on
 * 2026-09-29 `ReachabilitySwift` (12.0, via expo-updates) and `RNSVG` (12.4) failed the build.
 * Xcode 26 only warned. Inside the Podfile's `post_install`, every pod build configuration below
 * the app's own minimum (15.1, the Expo 54 template's `platform :ios`) is lifted to it. Nothing
 * runs below 15.1 anyway, so under Xcode 26.6 only those targets' build settings move.
 *
 * Kept free of Expo imports so `src/lib/pod-deployment-floor.test.ts` can test it directly.
 */
const FLOOR = "15.1";
const BEGIN = "# @levapp/pod-deployment-floor (PAD-467) begin";
const END = "# @levapp/pod-deployment-floor (PAD-467) end";
const POST_INSTALL = /^([ \t]*)post_install do \|installer\|[ \t]*\n/m;

function block(indent, floor) {
  const i = `${indent}  `;
  return [
    `${i}${BEGIN}`,
    `${i}installer.pods_project.targets.each do |target|`,
    `${i}  target.build_configurations.each do |build_config|`,
    `${i}    current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']`,
    `${i}    if current && Gem::Version.new(current) < Gem::Version.new('${floor}')`,
    `${i}      build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${floor}'`,
    `${i}    end`,
    `${i}  end`,
    `${i}end`,
    `${i}${END}`,
  ].join("\n");
}

/** The Podfile with the floor block at the top of `post_install`; unchanged if already there. */
function applyPodDeploymentFloor(podfile, floor = FLOOR) {
  if (podfile.includes(BEGIN)) return podfile;
  const match = POST_INSTALL.exec(podfile);
  if (!match) {
    throw new Error("with-pod-deployment-floor: the Podfile has no `post_install do |installer|` block to extend");
  }
  const at = match.index + match[0].length;
  return podfile.slice(0, at) + block(match[1], floor) + "\n" + podfile.slice(at);
}

module.exports = { FLOOR, BEGIN, END, applyPodDeploymentFloor };
