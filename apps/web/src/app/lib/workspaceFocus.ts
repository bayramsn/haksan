/**
 * Hedefin üstündeki bütün kapalı `<details>` kapaklarını açar.
 *
 * Çalışma alanı bölümleri katlanabildiği için, kapalı bir kapsayıcıya
 * kaydırmak kullanıcıyı boş bir başlığa götürürdü: engel düğmeleri,
 * "Engelleri çöz" ve aktivite derin bağlantıları hedefe varır ama hedefi
 * göstermezdi. Kaydırmadan önce yol açılır.
 */
function openCollapsedAncestors(target: HTMLElement) {
  let section = target.closest("details");
  while (section instanceof HTMLDetailsElement) {
    section.open = true;
    section = section.parentElement?.closest("details") ?? null;
  }
}

export function focusWorkspaceTarget(
  target: HTMLElement | null,
  options: { focus?: boolean; scroll?: boolean; block?: ScrollLogicalPosition } = {},
) {
  if (!target) return;
  const { focus = true, scroll = true, block = "center" } = options;
  openCollapsedAncestors(target);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (scroll) target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block });
  if (focus) target.focus({ preventScroll: true });
}
