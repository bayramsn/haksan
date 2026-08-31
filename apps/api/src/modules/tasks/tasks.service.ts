import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import type { TaskCreateInput, TaskListQuery, TaskUpdateInput } from '@haksan/shared';
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@haksan/shared';
import type { DbClient } from '../../db/client';
import {
  companies,
  contacts,
  notifications,
  opportunities,
  quotes,
  serviceTickets,
  taskEvents,
  tasks,
  users,
} from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { PushService } from '../../shared/push/push.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import {
  divisionFilterWithShared,
  resolveActorDivisionScope,
  resolveAssignedDivision,
} from '../../shared/utils/division-scope';

type TaskRow = typeof tasks.$inferSelect;

/**
 * ponytail: Türkiye 2016'dan beri kalıcı UTC+3, yaz saati yok. "Bugün"ün sınırını
 * bu sabit ofsetle hesaplıyoruz. Kiracı başına saat dilimi gerekirse tenants
 * tablosuna bir timezone kolonu ekleyip burayı Intl ile değiştirin.
 */
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

function dayBounds(now = new Date()): { start: Date; end: Date } {
  const local = new Date(now.getTime() + TZ_OFFSET_MS);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return { start: new Date(startLocal - TZ_OFFSET_MS), end: new Date(startLocal - TZ_OFFSET_MS + 86_400_000) };
}

/** Açık görev = üzerinde hâlâ iş var. Gecikme ve "bugün" sayımları bunun üstüne kurulu. */
const OPEN_STATUSES = ['todo', 'in_progress'] as const;

@Injectable()
export class TasksService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly push: PushService
  ) {}

  /** Ekibin bütün görevlerini görme ve başkasına atama yetkisi. */
  private canManage(actor: AuthContext) {
    return actor.permissions.has('tasks.manage');
  }

  /**
   * Görünürlük: yöneticiler kiracının (bölüm kapsamı içindeki) tüm görevlerini,
   * diğerleri yalnız kendine atanan ya da kendi açtığı görevleri görür.
   */
  private visibilityFilter(actor: AuthContext): SQL | undefined {
    // WithShared: birincil bölümü olmayan kullanıcının açtığı görev division_id
    // NULL kalıyor. Düz divisionFilter bu satırları eleyip yöneticiye normal
    // kullanıcıdan DAHA AZ görev gösteriyordu.
    if (this.canManage(actor)) return divisionFilterWithShared(resolveActorDivisionScope(actor), tasks.divisionId);
    return or(eq(tasks.assignedToUserId, actor.userId), eq(tasks.createdBy, actor.userId));
  }

  private baseFilters(actor: AuthContext): SQL[] {
    const filters: SQL[] = [eq(tasks.tenantId, actor.tenantId), isNull(tasks.deletedAt)];
    const visibility = this.visibilityFilter(actor);
    if (visibility) filters.push(visibility);
    return filters;
  }

  /** Hazır görünümlerin tarih/durum kısıtı. */
  private viewFilter(view: TaskListQuery['view'], actor: AuthContext): SQL | undefined {
    const { start, end } = dayBounds();
    switch (view) {
      case 'mine':
        return and(eq(tasks.assignedToUserId, actor.userId), inArray(tasks.status, [...OPEN_STATUSES]));
      case 'today':
        return and(gte(tasks.dueAt, start), lt(tasks.dueAt, end), inArray(tasks.status, [...OPEN_STATUSES]));
      case 'overdue':
        return and(lt(tasks.dueAt, new Date()), inArray(tasks.status, [...OPEN_STATUSES]));
      case 'upcoming':
        return and(gte(tasks.dueAt, end), inArray(tasks.status, [...OPEN_STATUSES]));
      case 'completed':
        return eq(tasks.status, 'done');
      case 'history':
        return inArray(tasks.status, ['done', 'cancelled']);
      default:
        return undefined;
    }
  }

  private queryFilters(actor: AuthContext, query: TaskListQuery): SQL[] {
    const filters = this.baseFilters(actor);
    const view = this.viewFilter(query.view, actor);
    if (view) filters.push(view);
    if (query.status) filters.push(eq(tasks.status, query.status));
    if (query.priority) filters.push(eq(tasks.priority, query.priority));
    if (query.assignedToUserId) filters.push(eq(tasks.assignedToUserId, query.assignedToUserId));
    if (query.createdBy) filters.push(eq(tasks.createdBy, query.createdBy));
    if (query.companyId) filters.push(eq(tasks.companyId, query.companyId));
    if (query.contactId) filters.push(eq(tasks.contactId, query.contactId));
    if (query.opportunityId) filters.push(eq(tasks.opportunityId, query.opportunityId));
    if (query.quoteId) filters.push(eq(tasks.quoteId, query.quoteId));
    if (query.serviceTicketId) filters.push(eq(tasks.serviceTicketId, query.serviceTicketId));
    if (query.dueFrom) filters.push(gte(tasks.dueAt, query.dueFrom));
    if (query.dueTo) filters.push(lte(tasks.dueAt, query.dueTo));
    if (query.relatedType) {
      const column = {
        company: tasks.companyId,
        contact: tasks.contactId,
        opportunity: tasks.opportunityId,
        quote: tasks.quoteId,
        service_ticket: tasks.serviceTicketId,
      }[query.relatedType as Exclude<typeof query.relatedType, 'none'>];
      filters.push(
        column
          ? isNotNull(column)
          : and(
              isNull(tasks.companyId),
              isNull(tasks.contactId),
              isNull(tasks.opportunityId),
              isNull(tasks.quoteId),
              isNull(tasks.serviceTicketId)
            )!
      );
    }
    if (query.search) {
      // Arama görevin kendi metnine ek olarak bağlı kaydın adına da bakar:
      // kullanıcı "ABC Makina" yazdığında o firmanın görevlerini bekler.
      const like = `%${query.search}%`;
      filters.push(
        or(
          ilike(tasks.title, like),
          ilike(tasks.description, like),
          sql`exists (select 1 from companies c where c.id = ${tasks.companyId} and (c.legal_title ilike ${like} or coalesce(c.short_name, '') ilike ${like}))`,
          sql`exists (select 1 from contacts ct where ct.id = ${tasks.contactId} and ct.full_name ilike ${like})`,
          sql`exists (select 1 from opportunities o where o.id = ${tasks.opportunityId} and o.title ilike ${like})`,
          sql`exists (select 1 from quotes q where q.id = ${tasks.quoteId} and q.document_no ilike ${like})`
        )!
      );
    }
    return filters;
  }

  private orderBy(query: TaskListQuery) {
    const dir = query.sortDir === 'desc' ? desc : asc;
    switch (query.sortBy) {
      case 'priority':
        // Metin sıralaması yanlış olurdu (acil < düşük); açık sıra veriyoruz.
        return [
          sql`case ${tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end ${sql.raw(query.sortDir)}`,
          sql`${tasks.dueAt} asc nulls last`,
          desc(tasks.id),
        ];
      case 'createdAt':
        return [dir(tasks.createdAt), desc(tasks.id)];
      case 'status':
        return [
          sql`case ${tasks.status} when 'todo' then 0 when 'in_progress' then 1 when 'done' then 2 else 3 end ${sql.raw(query.sortDir)}`,
          sql`${tasks.dueAt} asc nulls last`,
          desc(tasks.id),
        ];
      default:
        // Son tarihi olmayan görev listenin dibinde kalsın; acil işler önde.
        // Eşit sıralama anahtarlarında Postgres satır sırasını garanti etmez;
        // sayfalamada tekrar/kayıp olmasın diye id son kırıcı.
        return [sql`${tasks.dueAt} ${sql.raw(query.sortDir)} nulls last`, desc(tasks.createdAt), desc(tasks.id)];
    }
  }

  private selection() {
    const assignee = users;
    return {
      task: tasks,
      assignee: { id: assignee.id, fullName: assignee.fullName, email: assignee.email },
      company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
      contact: { id: contacts.id, fullName: contacts.fullName },
      opportunity: { id: opportunities.id, title: opportunities.title },
      quote: { id: quotes.id, documentNo: quotes.documentNo },
      serviceTicket: { id: serviceTickets.id, ticketNo: serviceTickets.ticketNo, subject: serviceTickets.subject },
    };
  }

  /** Satırı istemcinin beklediği düz biçime indirger; gecikme burada hesaplanır. */
  private present(row: {
    task: TaskRow;
    assignee: { id: string | null; fullName: string | null; email: string | null } | null;
    company: { id: string | null; legalTitle: string | null; shortName: string | null } | null;
    contact: { id: string | null; fullName: string | null } | null;
    opportunity: { id: string | null; title: string | null } | null;
    quote: { id: string | null; documentNo: string | null } | null;
    serviceTicket: { id: string | null; ticketNo: string | null; subject: string | null } | null;
  }) {
    // tenantId/divisionId/deletedAt/reminderSentAt iç alanlar; DTO'da yoklar,
    // spread ile sessizce JSON'a düşmesinler.
    const { tenantId: _tenantId, divisionId: _divisionId, deletedAt: _deletedAt, reminderSentAt: _reminderSentAt, ...task } = row.task;
    const open = task.status === 'todo' || task.status === 'in_progress';
    return {
      ...task,
      overdue: open && !!task.dueAt && task.dueAt.getTime() < Date.now(),
      assignee: row.assignee?.id ? row.assignee : null,
      company: row.company?.id ? row.company : null,
      contact: row.contact?.id ? row.contact : null,
      opportunity: row.opportunity?.id ? row.opportunity : null,
      quote: row.quote?.id ? row.quote : null,
      serviceTicket: row.serviceTicket?.id ? row.serviceTicket : null,
    };
  }

  /** Liste ve detay aynı join setini kullanır: ilgili kaydın adı tek turda gelsin. */
  private joined() {
    return this.db
      .select(this.selection())
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedToUserId, users.id))
      // Silinen kaydın adı görev satırında yaşamaya devam etmesin.
      .leftJoin(companies, and(eq(tasks.companyId, companies.id), isNull(companies.deletedAt)))
      .leftJoin(contacts, and(eq(tasks.contactId, contacts.id), isNull(contacts.deletedAt)))
      .leftJoin(opportunities, and(eq(tasks.opportunityId, opportunities.id), isNull(opportunities.deletedAt)))
      .leftJoin(quotes, and(eq(tasks.quoteId, quotes.id), isNull(quotes.deletedAt)))
      .leftJoin(serviceTickets, and(eq(tasks.serviceTicketId, serviceTickets.id), isNull(serviceTickets.deletedAt)));
  }

  async list(actor: AuthContext, query: TaskListQuery) {
    const where = and(...this.queryFilters(actor, query));
    const limit = query.pageSize;
    const offset = (query.page - 1) * limit;

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(tasks)
      .where(where);

    const rows = await this.joined()
      .where(where)
      .orderBy(...this.orderBy(query))
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((row: any) => this.present(row)),
      meta: { page: query.page, pageSize: limit, total, totalPages: Math.ceil(total / Math.max(limit, 1)) },
    };
  }

  /**
   * Üst şeritteki hızlı görünüm sayıları. Tek sorguda toplanır — altı ayrı
   * istek atmak listeyle birlikte yedi tur eder.
   */
  async counts(actor: AuthContext) {
    const { start, end } = dayBounds();
    const now = new Date();
    const openList = sql`('todo', 'in_progress')`;
    const [row] = await this.db
      .select({
        all: sql<number>`count(*)::int`,
        mine: sql<number>`count(*) filter (where ${tasks.assignedToUserId} = ${actor.userId} and ${tasks.status} in ${openList})::int`,
        today: sql<number>`count(*) filter (where ${tasks.dueAt} >= ${start} and ${tasks.dueAt} < ${end} and ${tasks.status} in ${openList})::int`,
        overdue: sql<number>`count(*) filter (where ${tasks.dueAt} < ${now} and ${tasks.status} in ${openList})::int`,
        upcoming: sql<number>`count(*) filter (where ${tasks.dueAt} >= ${end} and ${tasks.status} in ${openList})::int`,
        completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
        history: sql<number>`count(*) filter (where ${tasks.status} in ('done', 'cancelled'))::int`,
      })
      .from(tasks)
      .where(and(...this.baseFilters(actor)));
    return row;
  }

  /**
   * Yönetici özeti: kullanıcı başına açık / geciken / tamamlanan sayıları.
   * İlk sürümde dashboard yok; bu uç ileride onu besleyecek veriyi verir.
   */
  async summary(actor: AuthContext) {
    if (!this.canManage(actor)) throw new ForbiddenError('Ekip görev özetini görme yetkiniz yok');
    const now = new Date();
    const openList = sql`('todo', 'in_progress')`;
    return this.db
      .select({
        userId: users.id,
        fullName: users.fullName,
        open: sql<number>`count(*) filter (where ${tasks.status} in ${openList})::int`,
        overdue: sql<number>`count(*) filter (where ${tasks.status} in ${openList} and ${tasks.dueAt} < ${now})::int`,
        completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      })
      .from(tasks)
      .innerJoin(users, and(eq(tasks.assignedToUserId, users.id), eq(users.status, 'active'), isNull(users.deletedAt)))
      .where(and(...this.baseFilters(actor)))
      .groupBy(users.id, users.fullName)
      .orderBy(asc(users.fullName));
  }

  async get(actor: AuthContext, id: string) {
    const rows = await this.joined().where(and(eq(tasks.id, id), ...this.baseFilters(actor)));
    const row = rows[0];
    if (!row) throw new NotFoundError('Görev');
    const events = await this.db
      .select({
        id: taskEvents.id,
        eventType: taskEvents.eventType,
        summary: taskEvents.summary,
        createdAt: taskEvents.createdAt,
        actor: { id: users.id, fullName: users.fullName },
      })
      .from(taskEvents)
      .leftJoin(users, eq(taskEvents.actorUserId, users.id))
      .where(eq(taskEvents.taskId, id))
      .orderBy(desc(taskEvents.createdAt));
    return { ...this.present(row as any), events };
  }

  /** Bağlanan CRM kayıtlarının aynı kiracıda ve silinmemiş olduğunu doğrular. */
  private async assertReferences(actor: AuthContext, input: Partial<TaskCreateInput>) {
    const t = actor.tenantId;
    if (input.companyId) await this.assertExists(companies, input.companyId, t, 'Firma');
    if (input.contactId) await this.assertExists(contacts, input.contactId, t, 'Kontak');
    if (input.opportunityId) await this.assertExists(opportunities, input.opportunityId, t, 'Fırsat');
    if (input.quoteId) await this.assertExists(quotes, input.quoteId, t, 'Teklif');
    if (input.serviceTicketId) await this.assertExists(serviceTickets, input.serviceTicketId, t, 'Servis kaydı');
  }

  private async assertExists(
    table: typeof companies | typeof contacts | typeof opportunities | typeof quotes | typeof serviceTickets,
    id: string,
    tenantId: string,
    label: string
  ) {
    const [row] = await this.db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), eq(table.tenantId, tenantId), isNull(table.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundError(label);
  }

  /** Atanacak kullanıcı aynı kiracıda aktif olmalı; başkasına atamak yönetici işi. */
  private async assertAssignee(actor: AuthContext, assignedToUserId?: string | null) {
    if (assignedToUserId === actor.userId) return;
    // null (atamayı kaldırma) da yetki ister: aksi hâlde kişi kendine atanan
    // görevi sahipsizleştirip "Bana Atananlar"dan ve yönetici sayımından
    // düşürebiliyordu.
    if (!this.canManage(actor)) throw new ForbiddenError('Görevi başka bir kullanıcıya atama yetkiniz yok');
    if (!assignedToUserId) return;
    const target = await this.db.query.users.findFirst({
      columns: { id: true },
      where: and(
        eq(users.id, assignedToUserId),
        eq(users.tenantId, actor.tenantId),
        eq(users.status, 'active'),
        isNull(users.deletedAt)
      ),
    });
    if (!target) throw new NotFoundError('Kullanıcı');
  }

  private async logEvent(
    tx: DbClient,
    task: Pick<TaskRow, 'id' | 'tenantId'>,
    eventType: string,
    summary: string,
    actorUserId: string
  ) {
    await tx.insert(taskEvents).values({
      tenantId: task.tenantId,
      taskId: task.id,
      eventType,
      summary: summary.slice(0, 512),
      actorUserId,
    });
  }

  /** Atanan kişiye zil bildirimi + varsa push. Kendine atadığında sessiz. */
  private async notifyAssignee(task: TaskRow, actorUserId: string) {
    if (!task.assignedToUserId || task.assignedToUserId === actorUserId) return;
    const title = 'Size yeni bir görev atandı';
    const due = task.dueAt ? ` — son tarih ${this.formatWhen(task.dueAt)}` : '';
    const body = `${task.title}${due}`;
    await this.db.insert(notifications).values({
      tenantId: task.tenantId,
      userId: task.assignedToUserId,
      divisionId: task.divisionId,
      type: 'task_assigned',
      title,
      body,
      entityType: 'task',
      entityId: task.id,
    });
    await this.push.sendToUser(task.assignedToUserId, { title, body, data: { nav: 'tasks', entityId: task.id } });
  }

  private formatWhen(date: Date) {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Istanbul',
    }).format(date);
  }

  async create(actor: AuthContext, input: TaskCreateInput) {
    await this.assertReferences(actor, input);
    // Oluştururken atanan boş bırakılırsa görev sahibine düşer; yetki kontrolü
    // bu çözülmüş değer üzerinden yapılmalı, yoksa "kendime görev aç" 403 olur.
    const assignedToUserId = input.assignedToUserId ?? actor.userId;
    await this.assertAssignee(actor, assignedToUserId);
    const status = input.status ?? 'todo';
    const task = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(tasks)
        .values({
          tenantId: actor.tenantId,
          divisionId: resolveAssignedDivision(actor, null),
          title: input.title,
          description: input.description ?? null,
          status,
          priority: input.priority ?? 'normal',
          assignedToUserId,
          createdBy: actor.userId,
          dueAt: input.dueAt ?? null,
          remindBeforeMinutes: input.remindBeforeMinutes ?? null,
          companyId: input.companyId ?? null,
          contactId: input.contactId ?? null,
          opportunityId: input.opportunityId ?? null,
          quoteId: input.quoteId ?? null,
          serviceTicketId: input.serviceTicketId ?? null,
          completedAt: status === 'done' ? new Date() : null,
        })
        .returning();
      await this.logEvent(tx as DbClient, created, 'created', `Görev oluşturuldu: ${created.title}`, actor.userId);
      if (assignedToUserId !== actor.userId) {
        const assignee = await tx.query.users.findFirst({
          columns: { fullName: true },
          where: eq(users.id, assignedToUserId),
        });
        await this.logEvent(
          tx as DbClient,
          created,
          'assigned',
          `Görev ${assignee?.fullName ?? 'bir kullanıcıya'} atandı`,
          actor.userId
        );
      }
      return created;
    });

    await this.notifyAssignee(task, actor.userId);
    return this.get(actor, task.id);
  }

  /**
   * Yazma yolu okuma yoluyla AYNI kapsamı kullanır. Ayrı bir kural yazıldığında
   * bölüm kapsamı dışındaki görev listede görünmediği hâlde id'si bilinerek
   * güncellenebiliyordu; üstelik yazma işliyor, dönüş `get()` filtresine takılıp
   * 404 veriyordu.
   */
  private async findEditable(actor: AuthContext, id: string): Promise<TaskRow> {
    const task = await this.db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), ...this.baseFilters(actor)),
    });
    if (!task) throw new NotFoundError('Görev');
    return task;
  }

  async update(actor: AuthContext, id: string, input: TaskUpdateInput) {
    const current = await this.findEditable(actor, id);
    await this.assertReferences(actor, input);
    if (input.assignedToUserId !== undefined && input.assignedToUserId !== current.assignedToUserId) {
      await this.assertAssignee(actor, input.assignedToUserId);
    }

    const patch: Partial<TaskRow> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description ?? null;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.assignedToUserId !== undefined) patch.assignedToUserId = input.assignedToUserId ?? null;
    if (input.dueAt !== undefined) patch.dueAt = input.dueAt ?? null;
    if (input.remindBeforeMinutes !== undefined) {
      patch.remindBeforeMinutes = input.remindBeforeMinutes ?? null;
      // Hatırlatma penceresi değişti: daha önce gönderilmiş olsa da yeniden kurulur.
      patch.reminderSentAt = null;
    }
    if (input.companyId !== undefined) patch.companyId = input.companyId ?? null;
    if (input.contactId !== undefined) patch.contactId = input.contactId ?? null;
    if (input.opportunityId !== undefined) patch.opportunityId = input.opportunityId ?? null;
    if (input.quoteId !== undefined) patch.quoteId = input.quoteId ?? null;
    if (input.serviceTicketId !== undefined) patch.serviceTicketId = input.serviceTicketId ?? null;
    if (input.status !== undefined) {
      patch.status = input.status;
      // Kapanan görev hatırlatma sorgusundan zaten düşüyor; tekrar açılınca
      // hatırlatmanın yeniden kurulması için damga temizlenir.
      if (current.status === 'done' || current.status === 'cancelled') patch.reminderSentAt = null;
      // Tamamlanma tarihi durumdan türer; istemcinin ayrıca göndermesi gerekmez.
      patch.completedAt = input.status === 'done' ? current.completedAt ?? new Date() : null;
    }
    if (input.dueAt !== undefined) patch.reminderSentAt = null;

    // Değişen alan yoksa Drizzle `.set({})` üzerinde patlıyor; 500 yerine
    // görevin güncel hâlini döndürmek doğru cevap.
    if (Object.keys(patch).length === 0) return this.get(actor, id);

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx.update(tasks).set(patch).where(eq(tasks.id, id)).returning();

      if (patch.status !== undefined && patch.status !== current.status) {
        const wasClosed = current.status === 'done' || current.status === 'cancelled';
        const type = patch.status === 'done' ? 'completed' : wasClosed ? 'reopened' : 'status';
        await this.logEvent(
          tx as DbClient,
          row,
          type,
          patch.status === 'done'
            ? 'Görev tamamlandı'
            : wasClosed
              ? 'Görev tekrar açıldı'
              : `Durum ${TASK_STATUS_LABELS[patch.status]} olarak değiştirildi`,
          actor.userId
        );
      }
      if (patch.assignedToUserId !== undefined && patch.assignedToUserId !== current.assignedToUserId) {
        const assignee = patch.assignedToUserId
          ? await tx.query.users.findFirst({ columns: { fullName: true }, where: eq(users.id, patch.assignedToUserId) })
          : null;
        await this.logEvent(
          tx as DbClient,
          row,
          'assigned',
          assignee ? `Görev ${assignee.fullName} adlı kullanıcıya atandı` : 'Görevin atanan kullanıcısı kaldırıldı',
          actor.userId
        );
      }
      if (patch.dueAt !== undefined && patch.dueAt?.getTime() !== current.dueAt?.getTime()) {
        await this.logEvent(
          tx as DbClient,
          row,
          'due',
          patch.dueAt ? `Son tarih ${this.formatWhen(patch.dueAt)} olarak değiştirildi` : 'Son tarih kaldırıldı',
          actor.userId
        );
      }
      if (patch.priority !== undefined && patch.priority !== current.priority) {
        await this.logEvent(
          tx as DbClient,
          row,
          'status',
          `Öncelik ${TASK_PRIORITY_LABELS[patch.priority]} olarak değiştirildi`,
          actor.userId
        );
      }
      return row;
    });

    if (patch.assignedToUserId !== undefined && patch.assignedToUserId !== current.assignedToUserId) {
      await this.notifyAssignee(updated, actor.userId);
    }
    return this.get(actor, id);
  }

  async addComment(actor: AuthContext, id: string, comment: string) {
    const task = await this.findEditable(actor, id);
    await this.logEvent(this.db, task, 'comment', comment.trim(), actor.userId);
    return this.get(actor, id);
  }

  async remove(actor: AuthContext, id: string) {
    const task = await this.findEditable(actor, id);
    // `tasks.delete` iznini controller şart koşuyor; buradaki kural silme
    // yetkisi olsa bile başkasının görevine dokunulmaması.
    if (!this.canManage(actor) && task.createdBy !== actor.userId) {
      throw new ForbiddenError('Yalnız kendi açtığınız görevi silebilirsiniz');
    }
    await this.db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, id));
    return { deleted: true };
  }

  /**
   * Bir CRM kaydına bağlı görevlerin hareketleri — müşteri/lead geçmişinde
   * "görev atandı", "tamamlandı" satırlarını göstermek için. Görünürlük
   * kısıtı liste ile aynı: göremediğin görevin hareketini de göremezsin.
   */
  async eventsForRecord(actor: AuthContext, query: TaskListQuery) {
    const related = [query.companyId, query.contactId, query.opportunityId, query.quoteId, query.serviceTicketId];
    // Uç, bir kaydın geçmişi için var; filtresiz çağrı kiracının son 200
    // hareketini dökerdi.
    if (!related.some(Boolean)) throw new ValidationError('İlgili kayıt filtresi zorunlu');
    const filters = this.baseFilters(actor);
    if (query.companyId) filters.push(eq(tasks.companyId, query.companyId));
    if (query.contactId) filters.push(eq(tasks.contactId, query.contactId));
    if (query.opportunityId) filters.push(eq(tasks.opportunityId, query.opportunityId));
    if (query.quoteId) filters.push(eq(tasks.quoteId, query.quoteId));
    if (query.serviceTicketId) filters.push(eq(tasks.serviceTicketId, query.serviceTicketId));

    return this.db
      .select({
        id: taskEvents.id,
        taskId: taskEvents.taskId,
        taskTitle: tasks.title,
        eventType: taskEvents.eventType,
        summary: taskEvents.summary,
        createdAt: taskEvents.createdAt,
        actorName: users.fullName,
      })
      .from(taskEvents)
      .innerJoin(tasks, eq(taskEvents.taskId, tasks.id))
      .leftJoin(users, eq(taskEvents.actorUserId, users.id))
      .where(and(...filters))
      .orderBy(desc(taskEvents.createdAt))
      .limit(200);
  }

  /** Atanabilecek aktif kullanıcılar (görev formundaki "Atanacak kullanıcı" listesi). */
  async assignees(actor: AuthContext) {
    if (!this.canManage(actor)) {
      const me = await this.db.query.users.findFirst({
        columns: { id: true, fullName: true, email: true },
        where: eq(users.id, actor.userId),
      });
      return me ? [me] : [];
    }
    return this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, actor.tenantId), eq(users.status, 'active'), isNull(users.deletedAt)))
      .orderBy(asc(users.fullName));
  }
}
