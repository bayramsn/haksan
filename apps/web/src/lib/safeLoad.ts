/**
 * Bağımsız API yüklemeleri — bir istek başarısız olunca diğerlerini etkilemez.
 */
export async function safeLoad<T>(
  label: string,
  fn: () => Promise<T>,
  onError?: (err: unknown) => void
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    onError?.(err);
    console.warn(`[safeLoad] ${label} failed`, err);
    return undefined;
  }
}
