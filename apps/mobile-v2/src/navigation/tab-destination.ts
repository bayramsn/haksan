export type RouteState = { index?: number; key?: string; routes: readonly { name: string; state?: RouteState }[] };
const groups = ['(home)', '(companies)', '(opportunities)', '(calendar)', '(modules)'];
/** Includes Expo's root wrapper and the most recent stack beneath a root modal. */
export function underlyingTabs(node?: RouteState): RouteState | undefined {
  if (!node) return undefined;
  for (let index = Math.min(node.index ?? node.routes.length - 1, node.routes.length - 1); index >= 0; index--) {
    const route = node.routes[index];
    if (!route) continue;
    if (route.name === '(tabs)') return route.state;
    const nested = underlyingTabs(route.state);
    if (nested) return nested;
  }
  return undefined;
}
/** Root modals retain the underlying tab state. Keep saved records in that tab. */
export function recordDestination(path: string, state?: RouteState): string {
  const tabs = underlyingTabs(state);
  const group = tabs?.routes[tabs.index ?? 0]?.name;
  return group && groups.includes(group) && path.startsWith('/modules/')
    ? `/(tabs)/${group}${path}`
    : path;
}
