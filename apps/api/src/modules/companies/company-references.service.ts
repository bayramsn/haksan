import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { companyReferences } from '../../db/schema/companies';
import { DB } from '../../shared/database/database.module';
import { NotFoundError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type { CompanyReferenceCreateInput, CompanyReferenceUpdateInput } from '@haksan/shared';

const FIELDS = ['firm', 'contact', 'district', 'city', 'brand', 'model', 'deliveryDate', 'notes'] as const;

@Injectable()
export class CompanyReferencesService {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  /** Referans listesi bölüm bazlı değil; satış her bölümün teslimatını gösterebilmeli. */
  list(actor: AuthContext) {
    return this.db
      .select()
      .from(companyReferences)
      .where(and(eq(companyReferences.tenantId, actor.tenantId), isNull(companyReferences.deletedAt)))
      .orderBy(desc(companyReferences.deliveryDate), desc(companyReferences.createdAt));
  }

  private async find(id: string, actor: AuthContext) {
    const row = await this.db.query.companyReferences.findFirst({
      where: and(
        eq(companyReferences.id, id),
        eq(companyReferences.tenantId, actor.tenantId),
        isNull(companyReferences.deletedAt),
      ),
    });
    if (!row) throw new NotFoundError('Referans');
    return row;
  }

  async create(input: CompanyReferenceCreateInput, actor: AuthContext) {
    const [row] = await this.db
      .insert(companyReferences)
      .values({
        tenantId: actor.tenantId,
        firm: input.firm,
        contact: input.contact ?? null,
        district: input.district ?? null,
        city: input.city ?? null,
        brand: input.brand ?? null,
        model: input.model ?? null,
        deliveryDate: input.deliveryDate ?? null,
        notes: input.notes ?? null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    return row;
  }

  async update(id: string, input: CompanyReferenceUpdateInput, actor: AuthContext) {
    await this.find(id, actor);
    const patch: Record<string, unknown> = { updatedBy: actor.userId };
    for (const key of FIELDS) {
      if (input[key] !== undefined) patch[key] = input[key] ?? null;
    }
    const [row] = await this.db
      .update(companyReferences)
      .set(patch)
      .where(eq(companyReferences.id, id))
      .returning();
    return row;
  }

  async delete(id: string, actor: AuthContext) {
    await this.find(id, actor);
    await this.db
      .update(companyReferences)
      .set({ deletedAt: new Date(), updatedBy: actor.userId })
      .where(eq(companyReferences.id, id));
    return { ok: true };
  }
}
