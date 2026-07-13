import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { noteTemplates } from '../../db/schema/notes';
import { DB } from '../../shared/database/database.module';
import { ForbiddenError, NotFoundError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { NoteTemplateCreateInput, NoteTemplateUpdateInput } from '@haksan/shared';

@Injectable()
export class NoteTemplatesService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private readonly serviceReadableScopes = ['quote', 'service_quote'];

  private canRead(actor: AuthContext) {
    return actor.permissions.has('quotes.read') || actor.permissions.has('service_tickets.read');
  }

  private canManageScope(actor: AuthContext, scope: string) {
    if (scope === 'service_quote') {
      return actor.permissions.has('service_tickets.update') || actor.permissions.has('service_tickets.create');
    }
    return actor.permissions.has('quotes.create');
  }

  async list(actor: AuthContext, scope?: string) {
    if (!this.canRead(actor)) throw new ForbiddenError('Yetki gerekli: quotes.read veya service_tickets.read');
    const filters = [eq(noteTemplates.tenantId, actor.tenantId), isNull(noteTemplates.deletedAt)];
    if (actor.permissions.has('quotes.read')) {
      if (scope) filters.push(eq(noteTemplates.scope, scope));
    } else if (scope) {
      if (!this.serviceReadableScopes.includes(scope)) return [];
      filters.push(eq(noteTemplates.scope, scope));
    } else {
      filters.push(inArray(noteTemplates.scope, this.serviceReadableScopes));
    }
    return this.db
      .select()
      .from(noteTemplates)
      .where(and(...filters))
      .orderBy(desc(noteTemplates.createdAt));
  }

  async create(input: NoteTemplateCreateInput, actor: AuthContext) {
    if (!this.canManageScope(actor, input.scope)) {
      throw new ForbiddenError('Yetki gerekli: quotes.create veya servis not şablonu için service_tickets.update');
    }
    const [row] = await this.db
      .insert(noteTemplates)
      .values({
        tenantId: actor.tenantId,
        title: input.title,
        body: input.body,
        scope: input.scope,
        createdBy: actor.userId,
      })
      .returning();
    return row;
  }

  async update(id: string, input: NoteTemplateUpdateInput, actor: AuthContext) {
    const existing = await this.db.query.noteTemplates.findFirst({
      where: and(eq(noteTemplates.id, id), eq(noteTemplates.tenantId, actor.tenantId), isNull(noteTemplates.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Not şablonu');
    const nextScope = input.scope ?? existing.scope;
    if (!this.canManageScope(actor, existing.scope) || !this.canManageScope(actor, nextScope)) {
      throw new ForbiddenError('Yetki gerekli: quotes.create veya servis not şablonu için service_tickets.update');
    }

    const [row] = await this.db
      .update(noteTemplates)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        updatedBy: actor.userId,
      })
      .where(eq(noteTemplates.id, id))
      .returning();
    return row;
  }

  async delete(id: string, actor: AuthContext) {
    const existing = await this.db.query.noteTemplates.findFirst({
      where: and(eq(noteTemplates.id, id), eq(noteTemplates.tenantId, actor.tenantId), isNull(noteTemplates.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Not şablonu');
    if (!this.canManageScope(actor, existing.scope)) {
      throw new ForbiddenError('Yetki gerekli: quotes.create veya servis not şablonu için service_tickets.update');
    }
    await this.db.update(noteTemplates).set({ deletedAt: new Date() }).where(eq(noteTemplates.id, id));
    return { ok: true };
  }
}
