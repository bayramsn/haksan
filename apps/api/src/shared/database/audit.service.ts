import { Inject, Injectable } from '@nestjs/common';
import type { DbClient } from '../../db/client';
import { auditLogs } from '../../db/schema/audit';
import { DB } from './database.module';
import { logger } from '../utils/logger';

export interface AuditEntry {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

const REDACT_KEYS = new Set(['password', 'passwordHash', 'password_hash', 'tokenHash', 'refreshToken', 'token']);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  async write(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        tenantId: entry.tenantId ?? null,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        oldValues: entry.oldValues ? (redact(entry.oldValues) as Record<string, unknown>) : null,
        newValues: entry.newValues ? (redact(entry.newValues) as Record<string, unknown>) : null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        requestId: entry.requestId ?? null,
      });
    } catch (err) {
      logger.error({ err, entry: { ...entry, oldValues: '[…]', newValues: '[…]' } }, 'Audit write failed');
    }
  }
}
