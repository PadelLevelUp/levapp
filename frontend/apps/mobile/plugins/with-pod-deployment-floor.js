/**
 * Expo config plugin (PAD-467): lift pod deployment targets below the app's minimum (15.1) so the
 * project builds under Xcode 27, which rejects them; under Xcode 26.6 only those targets' settings
 * move. The transform is `pod-deployment-floor.js`.
 */
const { withPodfile } = require("expo/config-plugins");
const { applyPodDeploymentFloor } = require("./pod-deployment-floor");

module.exports = function withPodDeploymentFloor(config) {
  return withPodfile(config, (mod) => {
    mod.modResults.contents = applyPodDeploymentFloor(mod.modResults.contents);
    return mod;
  });
};
