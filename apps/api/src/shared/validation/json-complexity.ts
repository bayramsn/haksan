import { AppError } from '../utils/errors';

/**
 * Bound work before Zod 3 builds per-element validation errors. These limits keep
 * existing 5,000-row product imports and 10,000-ID Meta bulk actions supported.
 * Strings (including embedded PDF HTML) count once; binary uploads are untouched.
 * This is defense in depth while the shared Zod 3 schemas await a major migration.
 */
export const JSON_COMPLEXITY_LIMITS = {
  depth: 32,
  collectionEntries: 10_000,
  objectKeys: 1_000,
  totalValues: 100_000,
} as const;

export function assertJsonComplexity(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let visited = 0;
  const seen = new WeakSet<object>();
  const reject = (): never => { throw new AppError('INPUT_TOO_COMPLEX', 'İstek çok fazla veya çok derin iç içe alan içeriyor; işlemi daha küçük gruplara ayırın', 413); };
  while (pending.length) {
    const entry = pending.pop()!;
    if (++visited > JSON_COMPLEXITY_LIMITS.totalValues || entry.depth > JSON_COMPLEXITY_LIMITS.depth) reject();
    const current = entry.value;
    if (!current || typeof current !== 'object' || Buffer.isBuffer(current) || current instanceof Date) continue;
    if (seen.has(current)) reject(); // JSON cannot contain cycles or repeated object identities.
    seen.add(current);
    const array = Array.isArray(current);
    const sizeLimit = array ? JSON_COMPLEXITY_LIMITS.collectionEntries : JSON_COMPLEXITY_LIMITS.objectKeys;
    if (array && current.length > sizeLimit) reject();
    let entries = 0;
    // Count before pushing: even a wide object cannot fill an unbounded worklist.
    for (const key in current) {
      if (!Object.prototype.hasOwnProperty.call(current, key)) continue;
      if (++entries > sizeLimit || visited + pending.length + 1 > JSON_COMPLEXITY_LIMITS.totalValues) reject();
      pending.push({ value: (current as Record<string, unknown>)[key], depth: entry.depth + 1 });
    }
  }
}
