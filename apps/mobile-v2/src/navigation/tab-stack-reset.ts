type NavigationState = { key?: string; routes: readonly { name: string; state?: NavigationState }[] };
/**
 * Reset nested module detail first, then the shared stack (which can also hold profile/chat).
 * Yalnız üstünde ekran olan yığınlar döner: tek ekranlı yığına POP_TO_TOP "not handled" uyarısı verir.
 */
export function moduleResetTargets(state: NavigationState | undefined): string[] {
  const group = state?.routes.find((route) => route.name === '(modules)')?.state;
  if (!group) return [];
  const moduleStack = group.routes.find((route) => route.name === 'modules')?.state;
  return [moduleStack, group]
    .filter((stack): stack is NavigationState => Boolean(stack?.key) && (stack?.routes.length ?? 0) > 1)
    .map((stack) => stack.key!);
}
