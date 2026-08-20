export function focusWorkspaceTarget(
  target: HTMLElement | null,
  options: { focus?: boolean; scroll?: boolean; block?: ScrollLogicalPosition } = {},
) {
  if (!target) return;
  const { focus = true, scroll = true, block = "center" } = options;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (scroll) target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block });
  if (focus) target.focus({ preventScroll: true });
}
