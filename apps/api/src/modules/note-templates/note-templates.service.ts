import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { noteTemplates } from '../../db/schema/notes';
import { DB } from '../../shared/database/database.module';
import { NotFoundError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { NoteTemplateCreateInput } from '@haksan/shared';

@Injectable()
export class NoteTemplatesService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  async list(actor: AuthContext, scope?: string) {
    const filters = [eq(noteTemplates.tenantId, actor.tenantId), isNull(noteTemplates.deletedAt)];
    if (scope) filters.push(eq(noteTemplates.scope, scope));
    return this.db
      .select()
      .from(noteTemplates)
      .where(and(...filters))
      .orderBy(desc(noteTemplates.createdAt));
  }

  async create(input: NoteTemplateCreateInput, actor: AuthContext) {
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

  async delete(id: string, actor: AuthContext) {
    const existing = await this.db.query.noteTemplates.findFirst({
      where: and(eq(noteTemplates.id, id), eq(noteTemplates.tenantId, actor.tenantId), isNull(noteTemplates.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Not şablonu');
    await this.db.update(noteTemplates).set({ deletedAt: new Date() }).where(eq(noteTemplates.id, id));
    return { ok: true };
  }
}
