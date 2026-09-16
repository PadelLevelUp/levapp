const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo: watch the whole workspace so @levelup/* raw-TS packages resolve
// and hot-reload, and resolve modules from the app first, then the root.
config.watchFolders = [workspaceRoot];
// A git worktree borrows another checkout's node_modules through symlinks.
// Metro only resolves through symlinks whose targets sit inside a watched
// folder, so a worktree passes the lender's directories here (colon-separated)
// instead of copying gigabytes of dependencies. Unset in normal checkouts.
if (process.env.METRO_EXTRA_WATCH_FOLDERS) {
  config.watchFolders.push(
    ...process.env.METRO_EXTRA_WATCH_FOLDERS.split(":").filter(Boolean)
  );
}
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Packages that must be singletons. The web app hoists react 18 to the
// workspace root, so imports coming from @levelup/* (root packages/) would
// otherwise pull a SECOND react into the bundle. Pin them to the app's copy.
const singletons = ["react", "react-native", "react-native-css-interop"];

// tsconfig `paths` are disabled for Metro (app.json experiments.tsconfigPaths
// = false) because they alias react -> @types/react for type-checking only.
// Handle the "@/..." source alias here instead.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@/")) {
    return context.resolveRequest(
      context,
      path.join(projectRoot, "src", moduleName.slice(2)),
      platform
    );
  }

  const pinned = singletons.find(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`)
  );
  if (pinned) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, "package.json") },
      moduleName,
      platform
    );
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
