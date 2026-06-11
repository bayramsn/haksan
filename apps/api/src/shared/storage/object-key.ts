import { randomUUID } from 'node:crypto';

/**
 * tenant/{tenant_id}/{entity_type}/{entity_id}/{yyyy}/{mm}/{uuid}_{safe_filename}
 *
 * Filename is sanitized to ASCII + dashes; original filename is kept in DB.
 */
export function buildObjectKey(opts: {
  tenantId: string;
  entityType: string;
  entityId: string;
  filename: string;
  at?: Date;
}): string {
  const at = opts.at ?? new Date();
  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `tenant/${opts.tenantId}/${opts.entityType}/${opts.entityId}/${yyyy}/${mm}/${randomUUID()}_${sanitizeFilename(
    opts.filename
  )}`;
}

export function sanitizeFilename(name: string): string {
  // Strip path components, drop control chars, collapse whitespace, only keep
  // alnum + dash + underscore + dot, lowercase. Max 80 chars.
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return (
    base
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .toLowerCase() || 'file'
  );
}

export function tenantFromObjectKey(objectKey: string): string | null {
  const m = /^tenant\/([^/]+)\//.exec(objectKey);
  return m?.[1] ?? null;
}
