/**
 * client.route-loading rule 2 (PAD-585): what shows while a page chunk loads.
 * A full-height empty surface in the page background, with no text (so no i18n) and no spinner
 * (so a chunk already in cache shows no flash).
 */
export function RouteFallback() {
  return <div className="min-h-screen bg-background" data-testid="route-fallback" aria-busy="true" />;
}
