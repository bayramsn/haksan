import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, ilike, inArray, isNull, isNotNull, lt, ne, or, sql, type SQL } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { conversations, conversationMembers, chatMessages, chatMessageReactions } from '../../db/schema/chat';
import { users } from '../../db/schema/users';
import { files, fileLinks } from '../../db/schema/files';
import { currencies, pipelineStages, quoteStatuses } from '../../db/schema/lookup';
import { PushService } from '../../shared/push/push.service';
import { companies, notifications } from '../../db/schema/companies';
import { quotes } from '../../db/schema/quotes';
import { opportunities } from '../../db/schema/crm';
import { serviceTickets } from '../../db/schema/service';
import { DB } from '../../shared/database/database.module';
import { StorageService } from '../../shared/storage/storage.service';
import { ChatRealtimeService } from './chat.realtime';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { logger } from '../../shared/utils/logger';
import type { AuthContext } from '../../shared/security/auth.types';
import { resourceCompanyPortfolioFilter, resourceDivisionFilter } from '../../shared/utils/division-scope';
import {
  allowUnlinkedCompanyRecords,
  companyVisibilityExistsFilter,
  companyVisibilityFilter,
} from '../../shared/utils/company-visibility';
import type {
  ConversationPreferencesInput,
  CreateGroupInput,
  UpdateGroupInput,
  SendMessageInput,
  MessagesQuery,
  ChatMemberRole,
  ChatRefType,
} from '@haksan/shared';

/** Mesaj listelerken DB'den çekilen ham satır (zenginleştirme öncesi). */
interface RawMessageRow {
  id: string;
  mentionUserIds: string[];
  pinnedAt: Date | null;
  forwardedFromId: string | null;
  body: string | null;
  senderId: string;
  senderName: string;
  createdAt: Date;
  editedAt: Date | null;
  kind: string;
  replyToId: string | null;
  refType: string | null;
  refId: string | null;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
}

export interface RefCardDto {
  type: ChatRefType;
  id: string;
  title: string;
  subtitle: string | null;
  missing?: boolean;
  companyName?: string | null;
  stage?: string | null;
  amount?: string | null;
  currency?: string | null;
}

/** Sohbet ekleri için sabit bucket — ayrı bir R2 bucket'ı gerektirmeyecek şekilde
 * mevcut servis-dokümanı bucket'ı yeniden kullanılır. Object key tenant + entity ile
 * ayrıştığından çakışma olmaz. */
const CHAT_ATTACHMENT_ENTITY = 'chat_message';

export interface AttachmentDto {
  fileId: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly storage: StorageService,
    private readonly realtime: ChatRealtimeService,
    private readonly push: PushService
  ) {}

  /** Gerçek-zaman bildirimi: konuşma odasına + üyelerin kişisel odalarına yayınla.
   * Gateway kapalıysa (CHAT_REALTIME_ENABLED=false) no-op — ek sorgu da yapılmaz. */
  private async notify(conversationId: string, event: 'message:new' | 'message:updated'): Promise<void> {
    if (!this.realtime.enabled) return;
    this.realtime.emitToConversation(conversationId, event, { conversationId });
    const memberIds = await this.db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    this.realtime.emitToUsers(memberIds.map((m) => m.userId), 'conversation:updated', { conversationId });
  }

  /** Gateway el sıkışmasında üyelik kontrolü için public yardımcı. */
  async isMember(userId: string, conversationId: string): Promise<boolean> {
    const member = await this.getMember(userId, conversationId);
    return !!member;
  }

  /**
   * Sesli arama sinyalleşmesi: arayanın üyeliğini doğrular, karşı üyeleri ve
   * arayan adını döner. Şimdilik yalnız birebir (dm) konuşmalarda arama var.
   */
  async voiceCallContext(
    userId: string,
    conversationId: string,
  ): Promise<{ peerIds: string[]; callerName: string } | null> {
    if (!(await this.isMember(userId, conversationId))) return null;
    const [conv] = await this.db
      .select({ type: conversations.type, tenantId: conversations.tenantId })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), isNull(conversations.deletedAt)));
    if (!conv || conv.type !== 'dm') return null;
    const members = await this.db
      .select({ userId: users.id, fullName: users.fullName, status: users.status, deletedAt: users.deletedAt, tenantId: users.tenantId })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(eq(conversationMembers.conversationId, conversationId));
    if (members.length !== 2 || members.some(member => member.status !== 'active' || member.deletedAt || member.tenantId !== conv.tenantId)) return null;
    const caller = members.find(member => member.userId === userId);
    const peer = members.find(member => member.userId !== userId);
    if (!caller || !peer) return null;
    return { peerIds: [peer.userId], callerName: caller.fullName };
  }

  private isSuperAdmin(actor: AuthContext): boolean {
    return actor.roles.includes('super_admin');
  }

  private dmKeyFor(a: string, b: string): string {
    return [a, b].sort().join(':');
  }

  // ───────── Çalışan dizini ─────────
  async directory(actor: AuthContext) {
    const rows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        departmentId: users.departmentId,
        status: users.status,
      })
      .from(users)
      .where(and(eq(users.tenantId, actor.tenantId), isNull(users.deletedAt), eq(users.status, 'active'), ne(users.id, actor.userId)))
      .orderBy(asc(users.fullName));
    return rows;
  }

  // ───────── Konuşma listesi ─────────
  async listConversations(actor: AuthContext) {
    const myMemberships = await this.db
      .select({
        conv: conversations,
        myRole: conversationMembers.role,
        isFavorite: conversationMembers.isFavorite,
        isMuted: conversationMembers.isMuted,
      })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversationMembers.conversationId, conversations.id))
      .where(and(eq(conversationMembers.userId, actor.userId), eq(conversations.tenantId, actor.tenantId), isNull(conversations.deletedAt)));

    const convIds = myMemberships.map((m) => m.conv.id);
    if (convIds.length === 0) return [];

    // Üye önizleme (tüm konuşmaların üyeleri tek sorguda)
    const memberRows = await this.db
      .select({
        conversationId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
        role: conversationMembers.role,
        fullName: users.fullName,
        email: users.email,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(inArray(conversationMembers.conversationId, convIds));
    const membersByConv = new Map<string, { userId: string; role: string; fullName: string; email: string }[]>();
    for (const r of memberRows) {
      const list = membersByConv.get(r.conversationId) ?? [];
      list.push({ userId: r.userId, role: r.role, fullName: r.fullName, email: r.email });
      membersByConv.set(r.conversationId, list);
    }

    // Okunmamış sayıları (tek gruplu sorgu, üyenin lastReadAt'ine göre)
    const unreadRows = await this.db
      .select({
        conversationId: chatMessages.conversationId,
        count: sql<number>`count(*)::int`,
        mentionCount: sql<number>`(count(*) filter (where ${chatMessages.mentionUserIds} @> ${JSON.stringify([actor.userId])}::jsonb))::int`,
      })
      .from(chatMessages)
      .innerJoin(
        conversationMembers,
        and(eq(conversationMembers.conversationId, chatMessages.conversationId), eq(conversationMembers.userId, actor.userId))
      )
      .where(
        and(
          inArray(chatMessages.conversationId, convIds),
          eq(chatMessages.tenantId, actor.tenantId),
          isNull(chatMessages.deletedAt),
          ne(chatMessages.senderId, actor.userId),
          or(isNull(conversationMembers.lastReadAt), gt(chatMessages.createdAt, conversationMembers.lastReadAt))
        )
      )
      .groupBy(chatMessages.conversationId);
    const unreadByConv = new Map(unreadRows.map((row) => [row.conversationId, row]));

    // Son mesaj (konuşma başına 1 — pencere fonksiyonu ile)
    const ranked = this.db
      .select({
        conversationId: chatMessages.conversationId,
        id: chatMessages.id,
        body: chatMessages.body,
        latitude: chatMessages.latitude,
        longitude: chatMessages.longitude,
        senderId: chatMessages.senderId,
        createdAt: chatMessages.createdAt,
        rn: sql<number>`row_number() over (partition by ${chatMessages.conversationId} order by ${chatMessages.createdAt} desc, ${chatMessages.id} desc)`.as('rn'),
      })
      .from(chatMessages)
      .where(and(inArray(chatMessages.conversationId, convIds), isNull(chatMessages.deletedAt)))
      .as('ranked');
    const lastRows = await this.db
      .select({
        conversationId: ranked.conversationId,
        body: ranked.body,
        latitude: ranked.latitude,
        longitude: ranked.longitude,
        senderId: ranked.senderId,
        createdAt: ranked.createdAt,
      })
      .from(ranked)
      .where(eq(ranked.rn, 1));
    const lastByConv = new Map(lastRows.map((r) => [r.conversationId, r]));

    const result = myMemberships.map((m) => {
      const last = lastByConv.get(m.conv.id);
      return {
        id: m.conv.id,
        type: m.conv.type,
        title: m.conv.title,
        avatarFileId: m.conv.avatarFileId,
        onlyAdminsCanPost: m.conv.onlyAdminsCanPost,
        myRole: m.myRole as ChatMemberRole,
        members: membersByConv.get(m.conv.id) ?? [],
        isFavorite: m.isFavorite,
        isMuted: m.isMuted,
        unreadCount: unreadByConv.get(m.conv.id)?.count ?? 0,
        mentionCount: unreadByConv.get(m.conv.id)?.mentionCount ?? 0,
        lastMessage: last
          ? {
              preview: last.body ?? (last.latitude != null && last.longitude != null ? '📍 Konum' : '📎 Ek dosya'),
              senderId: last.senderId,
              createdAt: last.createdAt,
            }
          : null,
        lastActivityAt: last?.createdAt ?? m.conv.createdAt,
      };
    });

    result.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
    return result;
  }

  // ───────── DM bul-veya-oluştur ─────────
  async getOrCreateDm(actor: AuthContext, otherUserId: string) {
    if (otherUserId === actor.userId) throw new ValidationError('Kendinizle sohbet başlatamazsınız');
    const other = await this.db.query.users.findFirst({
      where: and(eq(users.id, otherUserId), eq(users.tenantId, actor.tenantId), isNull(users.deletedAt)),
    });
    if (!other) throw new NotFoundError('Kullanıcı');

    const dmKey = this.dmKeyFor(actor.userId, otherUserId);
    const existing = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.tenantId, actor.tenantId), eq(conversations.dmKey, dmKey), isNull(conversations.deletedAt)),
    });
    if (existing) return this.getConversation(actor, existing.id);

    try {
      const convId = await this.db.transaction(async (tx) => {
        const [conv] = await tx
          .insert(conversations)
          .values({ tenantId: actor.tenantId, type: 'dm', dmKey, createdBy: actor.userId })
          .returning({ id: conversations.id });
        await tx.insert(conversationMembers).values([
          { conversationId: conv.id, userId: actor.userId, role: 'member' },
          { conversationId: conv.id, userId: otherUserId, role: 'member' },
        ]);
        return conv.id;
      });
      return this.getConversation(actor, convId);
    } catch {
      // Eşzamanlı oluşturma yarışı: unique index tetiklendiyse mevcut DM'i getir.
      const again = await this.db.query.conversations.findFirst({
        where: and(eq(conversations.tenantId, actor.tenantId), eq(conversations.dmKey, dmKey), isNull(conversations.deletedAt)),
      });
      if (again) return this.getConversation(actor, again.id);
      throw new ValidationError('Sohbet oluşturulamadı, tekrar deneyin');
    }
  }

  // ───────── Grup kurma (yalnız süper admin — controller kontrol eder) ─────────
  async createGroup(actor: AuthContext, input: CreateGroupInput) {
    const memberIds = [...new Set(input.memberUserIds)].filter((id) => id !== actor.userId);
    if (memberIds.length) {
      const valid = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, actor.tenantId), isNull(users.deletedAt), inArray(users.id, memberIds)));
      const validSet = new Set(valid.map((v) => v.id));
      for (const id of memberIds) if (!validSet.has(id)) throw new ValidationError('Geçersiz üye kullanıcı');
    }

    const convId = await this.db.transaction(async (tx) => {
      const [conv] = await tx
        .insert(conversations)
        .values({
          tenantId: actor.tenantId,
          type: 'group',
          title: input.title,
          description: input.description ?? null,
          onlyAdminsCanPost: input.onlyAdminsCanPost,
          avatarFileId: input.avatarFileId ?? null,
          createdBy: actor.userId,
        })
        .returning({ id: conversations.id });
      await tx.insert(conversationMembers).values([
        { conversationId: conv.id, userId: actor.userId, role: 'admin' },
        ...memberIds.map((id) => ({ conversationId: conv.id, userId: id, role: 'member' as const })),
      ]);
      return conv.id;
    });
    return this.getConversation(actor, convId);
  }

  // ───────── Konuşma detayı ─────────
  async getConversation(actor: AuthContext, id: string) {
    const conv = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.tenantId, actor.tenantId), isNull(conversations.deletedAt)),
    });
    if (!conv) throw new NotFoundError('Sohbet');
    const membership = await this.assertMember(actor, id);

    const members = await this.db
      .select({
        userId: conversationMembers.userId,
        role: conversationMembers.role,
        fullName: users.fullName,
        email: users.email,
        lastReadAt: conversationMembers.lastReadAt,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(eq(conversationMembers.conversationId, id))
      .orderBy(asc(users.fullName));

    return {
      id: conv.id,
      type: conv.type,
      title: conv.title,
      description: conv.description,
      avatarFileId: conv.avatarFileId,
      onlyAdminsCanPost: conv.onlyAdminsCanPost,
      refType: conv.refType,
      refId: conv.refId,
      createdBy: conv.createdBy,
      members,
      myRole: membership.role as ChatMemberRole,
      isFavorite: membership.isFavorite,
      isMuted: membership.isMuted,
    };
  }

  // ───────── Grup güncelle ─────────
  async updateGroup(actor: AuthContext, id: string, input: UpdateGroupInput) {
    const conv = await this.loadGroupForManage(actor, id);
    await this.db
      .update(conversations)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.onlyAdminsCanPost !== undefined ? { onlyAdminsCanPost: input.onlyAdminsCanPost } : {}),
        ...(input.avatarFileId !== undefined ? { avatarFileId: input.avatarFileId } : {}),
      })
      .where(eq(conversations.id, conv.id));
    return this.getConversation(actor, id);
  }

  async addMembers(actor: AuthContext, id: string, userIds: string[]) {
    await this.loadGroupForManage(actor, id);
    const ids = [...new Set(userIds)];
    const valid = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, actor.tenantId), isNull(users.deletedAt), inArray(users.id, ids)));
    const validIds = valid.map((v) => v.id);
    if (validIds.length) {
      await this.db
        .insert(conversationMembers)
        .values(validIds.map((uid) => ({ conversationId: id, userId: uid, role: 'member' as const })))
        .onConflictDoNothing();
    }
    return this.getConversation(actor, id);
  }

  async removeMember(actor: AuthContext, id: string, userId: string) {
    await this.loadGroupForManage(actor, id);
    await this.db
      .delete(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)));
    return { ok: true };
  }

  async setMemberRole(actor: AuthContext, id: string, userId: string, role: ChatMemberRole) {
    await this.loadGroupForManage(actor, id);
    const updated = await this.db
      .update(conversationMembers)
      .set({ role })
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, userId)))
      .returning({ userId: conversationMembers.userId });
    if (!updated.length) throw new NotFoundError('Üye');
    return { ok: true };
  }

  // ───────── Mesaj listesi ─────────
  async listMessages(actor: AuthContext, conversationId: string, query: MessagesQuery) {
    await this.assertMember(actor, conversationId);
    const filters = [eq(chatMessages.conversationId, conversationId), eq(chatMessages.tenantId, actor.tenantId), isNull(chatMessages.deletedAt)];
    if (query.around) {
      const [target] = await this.loadRawMessages(and(...filters, eq(chatMessages.id, query.around)), 1);
      if (!target) throw new NotFoundError('Mesaj');
      const beforeLimit = Math.floor((query.limit - 1) / 2);
      const afterLimit = query.limit - 1 - beforeLimit;
      const position = sql`(${chatMessages.createdAt}, ${chatMessages.id})`;
      const pivot = sql`((select ${chatMessages.createdAt} from ${chatMessages} where ${chatMessages.id} = ${target.id}), ${target.id}::uuid)`;
      const [before, after] = await Promise.all([
        this.loadRawMessages(and(...filters, sql`${position} < ${pivot}`), beforeLimit + 1),
        afterLimit ? this.loadRawMessages(and(...filters, sql`${position} > ${pivot}`), afterLimit, 'asc') : [],
      ]);
      const rows = [...before.slice(0, beforeLimit).reverse(), target, ...after];
      return { messages: await this.enrichMessages(actor, rows), hasMore: before.length > beforeLimit };
    }
    if (query.before) {
      const beforeDate = new Date(query.before);
      if (!Number.isNaN(beforeDate.getTime())) filters.push(lt(chatMessages.createdAt, beforeDate));
    }
    if (query.search) {
      const literalSearch = query.search.replace(/[\\%_]/g, '\\$&');
      filters.push(ilike(chatMessages.body, `%${literalSearch}%`));
    }
    const rows = await this.loadRawMessages(and(...filters), query.limit);
    const hasMore = rows.length === query.limit;
    rows.reverse(); // en eski → en yeni (ekranda akış sırası)
    const messages = await this.enrichMessages(actor, rows);
    return { messages, hasMore };
  }

  async editMessage(actor: AuthContext, messageId: string, body: string) {
    const msg = await this.db.query.chatMessages.findFirst({
      where: and(eq(chatMessages.id, messageId), eq(chatMessages.tenantId, actor.tenantId), isNull(chatMessages.deletedAt)),
    });
    if (!msg) throw new NotFoundError('Mesaj');
    if (msg.senderId !== actor.userId) throw new ForbiddenError('Yalnızca kendi mesajınızı düzenleyebilirsiniz');
    await this.assertMember(actor, msg.conversationId);
    if (msg.kind === 'system') throw new ValidationError('Sistem mesajı düzenlenemez');
    await this.db.update(chatMessages).set({ body: body.trim(), mentionUserIds: [], editedAt: new Date() }).where(eq(chatMessages.id, messageId));
    const [row] = await this.enrichMessages(actor, await this.loadRawMessages(eq(chatMessages.id, messageId)));
    await this.notify(msg.conversationId, 'message:updated');
    return row;
  }

  async toggleReaction(actor: AuthContext, messageId: string, emoji: string) {
    const msg = await this.db.query.chatMessages.findFirst({
      where: and(eq(chatMessages.id, messageId), eq(chatMessages.tenantId, actor.tenantId), isNull(chatMessages.deletedAt)),
    });
    if (!msg) throw new NotFoundError('Mesaj');
    await this.assertMember(actor, msg.conversationId);
    const existing = await this.db.query.chatMessageReactions.findFirst({
      where: and(
        eq(chatMessageReactions.messageId, messageId),
        eq(chatMessageReactions.userId, actor.userId),
        eq(chatMessageReactions.emoji, emoji)
      ),
    });
    if (existing) {
      await this.db
        .delete(chatMessageReactions)
        .where(
          and(
            eq(chatMessageReactions.messageId, messageId),
            eq(chatMessageReactions.userId, actor.userId),
            eq(chatMessageReactions.emoji, emoji)
          )
        );
    } else {
      await this.db.insert(chatMessageReactions).values({ messageId, userId: actor.userId, emoji });
    }
    const reactions = (await this.resolveReactions(actor, [messageId])).get(messageId) ?? [];
    await this.notify(msg.conversationId, 'message:updated');
    return { messageId, reactions };
  }

  /** Sistem mesajı (otomatik bildirim) ekler. Modüller arası entegrasyon için
   * dışa açık; örn. "Teklif onaylandı" bildirimini ilgili gruba düşürmek için. */
  async postSystemMessage(tenantId: string, conversationId: string, actorUserId: string, body: string) {
    const [msg] = await this.db
      .insert(chatMessages)
      .values({ tenantId, conversationId, senderId: actorUserId, body, kind: 'system' })
      .returning({ id: chatMessages.id });
    await this.db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
    return msg.id;
  }

  // ───────── Mesaj gönder ─────────
  async sendMessage(actor: AuthContext, conversationId: string, input: SendMessageInput, forwarded?: { id: string; fileIds: string[] }) {
    const conv = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.tenantId, actor.tenantId), isNull(conversations.deletedAt)),
    });
    if (!conv) throw new NotFoundError('Sohbet');
    const member = await this.assertMember(actor, conversationId);

    // Duyuru grubu: yalnız admin/süper admin yazabilir.
    if (conv.type === 'group' && conv.onlyAdminsCanPost && member.role !== 'admin' && !this.isSuperAdmin(actor)) {
      throw new ForbiddenError('Bu grupta yalnızca yöneticiler mesaj gönderebilir');
    }

    const mentionUserIds = [...new Set(input.mentionUserIds ?? [])].filter((id) => id !== actor.userId);
    if (mentionUserIds.length) {
      if (conv.type !== 'group' || !input.body?.trim()) throw new ValidationError('Bahsetme için grup mesajı gerekli');
      const members = await this.db.select({ id: users.id, name: users.fullName })
        .from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId))
        .where(and(eq(conversationMembers.conversationId, conversationId), eq(users.tenantId, actor.tenantId), isNull(users.deletedAt), inArray(users.id, mentionUserIds)));
      if (members.length !== mentionUserIds.length || members.some((m) => !input.body?.includes(`@${m.name}`))) {
        throw new ValidationError('Bahsedilen kullanıcı grup üyesi olmalı ve mesajda yer almalı');
      }
    }
    const fileIds = [...new Set(input.attachmentFileIds ?? [])];
    if (fileIds.length) {
      const owned = await this.db
        .select({ id: files.id })
        .from(files)
        .where(
          and(
            eq(files.tenantId, actor.tenantId),
            eq(files.uploadedBy, actor.userId),
            eq(files.uploadStatus, 'uploaded'),
            isNull(files.deletedAt),
            inArray(files.id, fileIds)
          )
        );
      if (owned.length !== fileIds.length) throw new ValidationError('Geçersiz veya erişilemeyen ek dosya');
    }

    // Yanıt: aynı konuşmada, silinmemiş bir mesaj olmalı.
    if (input.replyToId) {
      const rep = await this.db.query.chatMessages.findFirst({
        where: and(eq(chatMessages.id, input.replyToId), eq(chatMessages.conversationId, conversationId), isNull(chatMessages.deletedAt)),
      });
      if (!rep) throw new ValidationError('Yanıtlanan mesaj bulunamadı');
    }
    // CRM kayıt kartı: kayıt tenant'a ait ve mevcut olmalı.
    if (input.refType && input.refId) {
      const cards = await this.resolveRefCards(actor, [{ type: input.refType, id: input.refId }]);
      const card = cards.get(`${input.refType}:${input.refId}`);
      if (!card || card.missing) throw new ValidationError('Paylaşılan kayıt bulunamadı');
    }

    const body = input.body?.trim() ? input.body.trim() : null;
    const messageId = await this.db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(chatMessages)
        .values({
          tenantId: actor.tenantId,
          conversationId,
          senderId: actor.userId,
          body,
          mentionUserIds,
          forwardedFromId: forwarded?.id ?? null,
          replyToId: input.replyToId ?? null,
          refType: input.refType ?? null,
          refId: input.refId ?? null,
          latitude: input.location?.latitude ?? null,
          longitude: input.location?.longitude ?? null,
          locationLabel: input.location?.label ?? null,
      })
      .returning({ id: chatMessages.id });
      if (fileIds.length) {
        const claimedFiles = await tx
          .update(files)
          .set({ uploadStatus: 'linked' })
          .where(
            and(
              eq(files.tenantId, actor.tenantId),
              eq(files.uploadedBy, actor.userId),
              eq(files.uploadStatus, 'uploaded'),
              inArray(files.id, fileIds)
            )
          )
          .returning({ id: files.id });
        if (claimedFiles.length !== fileIds.length) {
          throw new ValidationError('Ek dosyalardan biri başka bir kayda bağlanmış');
        }
        await tx.insert(fileLinks).values(
          fileIds.map((fid) => ({
            tenantId: actor.tenantId,
            fileId: fid,
            entityType: CHAT_ATTACHMENT_ENTITY,
            entityId: msg.id,
          }))
        );
      }
      if (forwarded?.fileIds.length) {
        await tx.insert(fileLinks).values(forwarded.fileIds.map((fileId) => ({ tenantId: actor.tenantId, fileId, entityType: CHAT_ATTACHMENT_ENTITY, entityId: msg.id })));
      }
      if (mentionUserIds.length) {
        await tx.insert(notifications).values(mentionUserIds.map((userId) => ({
          tenantId: actor.tenantId, userId, type: 'chat_mention', title: `${(conv.title ?? 'Grup').slice(0, 220)}: Sizden bahsedildi`,
          body: body?.slice(0, 500), entityType: 'chat', entityId: conversationId,
          items: [{ label: 'Mesaja git', nav: 'chat', query: `${conversationId}:${msg.id}` }],
        })));
      }
      // Konuşma sıralamasını tazele + gönderen kendi mesajını okumuş sayılır.
      await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
      await tx
        .update(conversationMembers)
        .set({ lastReadAt: new Date() })
        .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, actor.userId)));
      return msg.id;
    });

    const [row] = await this.enrichMessages(actor, await this.loadRawMessages(eq(chatMessages.id, messageId)));
    await this.notify(conversationId, 'message:new');
    if (conv.type === 'dm') void this.pushDirectMessage(actor, conversationId, messageId);
    if (mentionUserIds.length) {
      this.realtime.emitToUsers(mentionUserIds, 'notification:new', { type: 'chat_mention', conversationId, messageId });
      void Promise.allSettled(mentionUserIds.map((userId) => this.push.sendToUser(userId, {
        title: `${(conv.title ?? 'Grup').slice(0, 220)}: Sizden bahsedildi`, body: body?.slice(0, 200) ?? '',
        data: { kind: 'navigate', nav: 'chat', query: `${conversationId}:${messageId}`, conversationId, messageId },
      })));
    }
    return row;
  }

  private async pushDirectMessage(actor: AuthContext, conversationId: string, messageId: string): Promise<void> {
    try {
      const [recipient] = await this.db.select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .innerJoin(users, eq(users.id, conversationMembers.userId))
        .where(and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.isMuted, false),
          ne(conversationMembers.userId, actor.userId),
          eq(users.tenantId, actor.tenantId),
          eq(users.status, 'active'),
          isNull(users.deletedAt),
        ))
        .limit(1);
      if (recipient) await this.push.sendToUser(recipient.userId, {
        title: 'Yeni sohbet mesajı',
        body: 'Mesajı görüntülemek için sohbeti açın.',
        data: { kind: 'navigate', nav: 'chat', query: `${conversationId}:${messageId}`, conversationId, messageId },
      });
    } catch {
      logger.warn({ action: 'chat_push_failed', conversationId }, 'Sohbet bildirimi gönderilemedi');
    }
  }

  async updatePreferences(actor: AuthContext, conversationId: string, input: ConversationPreferencesInput) {
    const [preferences] = await this.db.update(conversationMembers)
      .set(input)
      .where(and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, actor.userId),
        inArray(conversationMembers.conversationId, this.db.select({ id: conversations.id }).from(conversations).where(and(
          eq(conversations.id, conversationId),
          eq(conversations.tenantId, actor.tenantId),
          isNull(conversations.deletedAt),
        ))),
      ))
      .returning({ isFavorite: conversationMembers.isFavorite, isMuted: conversationMembers.isMuted });
    if (!preferences) throw new ForbiddenError('Bu sohbete erişiminiz yok');
    this.realtime.emitToUsers([actor.userId], 'conversation:updated', { conversationId });
    return preferences;
  }

  async listSharedFiles(actor: AuthContext, conversationId: string): Promise<AttachmentDto[]> {
    await this.assertMember(actor, conversationId);
    const rows = await this.db.select({
      fileId: files.id,
      bucket: files.bucket,
      objectKey: files.objectKey,
      filename: files.originalFilename,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
    })
      .from(chatMessages)
      .innerJoin(conversations, eq(conversations.id, chatMessages.conversationId))
      .innerJoin(conversationMembers, and(
        eq(conversationMembers.conversationId, conversations.id),
        eq(conversationMembers.userId, actor.userId),
      ))
      .innerJoin(fileLinks, and(eq(fileLinks.entityId, chatMessages.id), eq(fileLinks.entityType, CHAT_ATTACHMENT_ENTITY)))
      .innerJoin(files, eq(files.id, fileLinks.fileId))
      .where(and(
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.tenantId, actor.tenantId),
        eq(conversations.tenantId, actor.tenantId),
        eq(fileLinks.tenantId, actor.tenantId),
        eq(files.tenantId, actor.tenantId),
        eq(files.uploadStatus, 'linked'),
        isNull(conversations.deletedAt),
        isNull(chatMessages.deletedAt),
        isNull(files.deletedAt),
      ))
      .groupBy(files.id)
      .orderBy(desc(sql`max(${chatMessages.createdAt})`), desc(files.id))
      .limit(50);
    return Promise.all(rows.map((row) => this.signChatAttachment(actor, row)));
  }

  async listPinned(actor: AuthContext, conversationId: string) {
    await this.assertMember(actor, conversationId);
    return this.enrichMessages(actor, await this.loadRawMessages(and(eq(chatMessages.conversationId, conversationId), eq(chatMessages.tenantId, actor.tenantId), isNull(chatMessages.deletedAt), isNotNull(chatMessages.pinnedAt)), 100));
  }

  async pinMessage(actor: AuthContext, messageId: string, pinned: boolean) {
    const msg = await this.db.query.chatMessages.findFirst({ where: and(eq(chatMessages.id, messageId), eq(chatMessages.tenantId, actor.tenantId), isNull(chatMessages.deletedAt)) });
    if (!msg) throw new NotFoundError('Mesaj');
    const member = await this.assertMember(actor, msg.conversationId);
    const conv = await this.db.query.conversations.findFirst({ where: eq(conversations.id, msg.conversationId) });
    if (conv?.type === 'group' && member.role !== 'admin' && !this.isSuperAdmin(actor)) throw new ForbiddenError('Mesajı yalnız grup yöneticileri sabitleyebilir');
    await this.db.update(chatMessages).set({ pinnedAt: pinned ? new Date() : null }).where(eq(chatMessages.id, messageId));
    const [row] = await this.enrichMessages(actor, await this.loadRawMessages(eq(chatMessages.id, messageId)));
    await this.notify(msg.conversationId, 'message:updated');
    return row;
  }

  async forwardMessage(actor: AuthContext, messageId: string, conversationId: string) {
    const source = await this.db.query.chatMessages.findFirst({ where: and(eq(chatMessages.id, messageId), eq(chatMessages.tenantId, actor.tenantId), isNull(chatMessages.deletedAt)) });
    if (!source) throw new NotFoundError('Mesaj');
    await this.assertMember(actor, source.conversationId);
    if (source.kind === 'system') throw new ValidationError('Sistem mesajı iletilemez');
    const links = await this.db.select({ fileId: fileLinks.fileId }).from(fileLinks)
      .innerJoin(files, eq(files.id, fileLinks.fileId))
      .where(and(eq(fileLinks.tenantId, actor.tenantId), eq(fileLinks.entityType, CHAT_ATTACHMENT_ENTITY), eq(fileLinks.entityId, messageId), eq(files.tenantId, actor.tenantId), eq(files.uploadStatus, 'linked'), isNull(files.deletedAt)));
    return this.sendMessage(actor, conversationId, {
      body: source.body ?? undefined,
      ...(source.refType && source.refId ? { refType: source.refType as ChatRefType, refId: source.refId } : {}),
      ...(source.latitude != null && source.longitude != null ? { location: { latitude: source.latitude, longitude: source.longitude, label: source.locationLabel ?? undefined } } : {}),
    }, { id: source.id, fileIds: links.map((r) => r.fileId) });
  }

  async typingContext(userId: string, conversationId: string) {
    const member = await this.getMember(userId, conversationId);
    if (!member) return null;
    const conv = await this.db.query.conversations.findFirst({ where: and(eq(conversations.id, conversationId), isNull(conversations.deletedAt)) });
    if (!conv) return null;
    const user = await this.db.query.users.findFirst({ where: and(eq(users.id, userId), eq(users.tenantId, conv.tenantId), eq(users.status, 'active'), isNull(users.deletedAt)) });
    if (!user) return null;
    if (conv.type === 'group' && conv.onlyAdminsCanPost && member.role !== 'admin') return null;
    return { fullName: user.fullName };
  }

  async markRead(actor: AuthContext, conversationId: string) {
    await this.assertMember(actor, conversationId);
    await this.db
      .update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, actor.userId)));
    return { ok: true };
  }

  async deleteMessage(actor: AuthContext, messageId: string) {
    const msg = await this.db.query.chatMessages.findFirst({
      where: and(eq(chatMessages.id, messageId), eq(chatMessages.tenantId, actor.tenantId), isNull(chatMessages.deletedAt)),
    });
    if (!msg) throw new NotFoundError('Mesaj');

    let allowed = msg.senderId === actor.userId || this.isSuperAdmin(actor);
    if (!allowed) {
      // Grup admini başkasının mesajını silebilir.
      const conv = await this.db.query.conversations.findFirst({ where: eq(conversations.id, msg.conversationId) });
      if (conv?.type === 'group') {
        const member = await this.getMember(actor.userId, msg.conversationId);
        allowed = member?.role === 'admin';
      }
    }
    if (!allowed) throw new ForbiddenError('Bu mesajı silme yetkiniz yok');
    await this.db.update(chatMessages).set({ deletedAt: new Date() }).where(eq(chatMessages.id, messageId));
    await this.notify(msg.conversationId, 'message:updated');
    return { ok: true };
  }

  // ───────── Yardımcılar ─────────
  private async getMember(userId: string, conversationId: string) {
    return this.db.query.conversationMembers.findFirst({
      where: and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)),
    });
  }

  private async assertMember(actor: AuthContext, conversationId: string) {
    const member = await this.getMember(actor.userId, conversationId);
    if (!member) throw new ForbiddenError('Bu sohbete erişiminiz yok');
    return member;
  }

  /** Grup yönetimi: süper admin veya o grubun admini. Konuşmayı döndürür. */
  private async loadGroupForManage(actor: AuthContext, id: string) {
    const conv = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, id), eq(conversations.tenantId, actor.tenantId), isNull(conversations.deletedAt)),
    });
    if (!conv) throw new NotFoundError('Sohbet');
    if (conv.type !== 'group') throw new ValidationError('Bu işlem yalnızca gruplar için geçerli');
    if (!this.isSuperAdmin(actor)) {
      const member = await this.getMember(actor.userId, id);
      if (member?.role !== 'admin') throw new ForbiddenError('Grup yönetimi için yetkiniz yok');
    }
    return conv;
  }

  private previewOf(m: { body: string | null; kind: string }): string {
    if (m.body && m.body.trim()) return m.body.trim().slice(0, 80);
    if (m.kind === 'voice') return '🎤 Sesli mesaj';
    return '📎 Ek';
  }

  private async loadRawMessages(where: SQL | undefined, limit?: number, direction: 'asc' | 'desc' = 'desc'): Promise<RawMessageRow[]> {
    const base = this.db
      .select({
        id: chatMessages.id,
        body: chatMessages.body,
        mentionUserIds: chatMessages.mentionUserIds,
        pinnedAt: chatMessages.pinnedAt,
        forwardedFromId: chatMessages.forwardedFromId,
        senderId: chatMessages.senderId,
        senderName: users.fullName,
        createdAt: chatMessages.createdAt,
        editedAt: chatMessages.editedAt,
        kind: chatMessages.kind,
        replyToId: chatMessages.replyToId,
        refType: chatMessages.refType,
        refId: chatMessages.refId,
        latitude: chatMessages.latitude,
        longitude: chatMessages.longitude,
        locationLabel: chatMessages.locationLabel,
      })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.senderId, users.id))
      .where(where)
      .orderBy(...(direction === 'asc' ? [asc(chatMessages.createdAt), asc(chatMessages.id)] : [desc(chatMessages.createdAt), desc(chatMessages.id)]));
    return limit ? base.limit(limit) : base;
  }

  private async enrichMessages(actor: AuthContext, rows: RawMessageRow[]) {
    const ids = rows.map((r) => r.id);
    const [attachments, reactions, replies, refs] = await Promise.all([
      this.resolveAttachments(actor, ids),
      this.resolveReactions(actor, ids),
      this.resolveReplies(rows),
      this.resolveRefs(actor, rows),
    ]);
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      mentionUserIds: r.mentionUserIds,
      pinnedAt: r.pinnedAt,
      forwardedFromId: r.forwardedFromId,
      senderId: r.senderId,
      senderName: r.senderName,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
      kind: r.kind,
      location:
        r.latitude != null && r.longitude != null
          ? { latitude: r.latitude, longitude: r.longitude, label: r.locationLabel }
          : null,
      attachments: attachments.get(r.id) ?? [],
      reactions: reactions.get(r.id) ?? [],
      replyTo: replies.get(r.id) ?? null,
      refCard: refs.get(r.id) ?? null,
    }));
  }

  private async resolveReactions(actor: AuthContext, messageIds: string[]) {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
    if (messageIds.length === 0) return map;
    const rows = await this.db
      .select({ messageId: chatMessageReactions.messageId, emoji: chatMessageReactions.emoji, userId: chatMessageReactions.userId })
      .from(chatMessageReactions)
      .where(inArray(chatMessageReactions.messageId, messageIds));
    const agg = new Map<string, Map<string, { count: number; mine: boolean }>>();
    for (const r of rows) {
      const byEmoji = agg.get(r.messageId) ?? new Map<string, { count: number; mine: boolean }>();
      const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.userId === actor.userId) cur.mine = true;
      byEmoji.set(r.emoji, cur);
      agg.set(r.messageId, byEmoji);
    }
    for (const [mid, byEmoji] of agg) {
      map.set(
        mid,
        [...byEmoji.entries()].map(([emoji, v]) => ({ emoji, count: v.count, mine: v.mine }))
      );
    }
    return map;
  }

  private async resolveReplies(rows: RawMessageRow[]) {
    const map = new Map<string, { id: string; senderName: string; preview: string }>();
    const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x))];
    if (replyIds.length === 0) return map;
    const reps = await this.db
      .select({ id: chatMessages.id, body: chatMessages.body, kind: chatMessages.kind, senderName: users.fullName })
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.senderId, users.id))
      .where(inArray(chatMessages.id, replyIds));
    const byId = new Map(reps.map((x) => [x.id, { id: x.id, senderName: x.senderName, preview: this.previewOf(x) }]));
    for (const r of rows) {
      const rep = r.replyToId ? byId.get(r.replyToId) : undefined;
      if (rep) map.set(r.id, rep);
    }
    return map;
  }

  private async resolveRefs(actor: AuthContext, rows: RawMessageRow[]) {
    const map = new Map<string, RefCardDto>();
    const refs = rows
      .filter((r) => r.refType && r.refId)
      .map((r) => ({ type: r.refType as ChatRefType, id: r.refId as string }));
    if (refs.length === 0) return map;
    const cards = await this.resolveRefCards(actor, refs);
    for (const r of rows) {
      if (r.refType && r.refId) {
        const c = cards.get(`${r.refType}:${r.refId}`);
        if (c) map.set(r.id, c);
      }
    }
    return map;
  }

  private async resolveRefCards(actor: AuthContext, refs: { type: ChatRefType; id: string }[]) {
    const map = new Map<string, RefCardDto>();
    if (refs.length === 0) return map;
    const idsByType: Record<ChatRefType, string[]> = { quote: [], company: [], service_ticket: [], opportunity: [] };
    for (const r of refs) if (!idsByType[r.type].includes(r.id)) idsByType[r.type].push(r.id);

    if (idsByType.quote.length && actor.permissions.has('quotes.read')) {
      const visibility = await companyVisibilityExistsFilter(this.db, actor, quotes.companyId);
      const rows = await this.db
        .select({ id: quotes.id, documentNo: quotes.documentNo, companyName: companies.legalTitle, stage: quoteStatuses.name, amount: quotes.grandTotal, currency: currencies.code })
        .from(quotes)
        .leftJoin(companies, eq(companies.id, quotes.companyId))
        .leftJoin(quoteStatuses, eq(quoteStatuses.id, quotes.statusId))
        .leftJoin(currencies, eq(currencies.id, quotes.currencyId))
        .where(
          and(
            eq(quotes.tenantId, actor.tenantId),
            isNull(quotes.deletedAt),
            resourceDivisionFilter(actor, 'quotes', quotes.divisionId) ?? sql`true`,
            allowUnlinkedCompanyRecords(quotes.companyId, visibility),
            inArray(quotes.id, idsByType.quote)
          )
        );
      for (const q of rows) map.set(`quote:${q.id}`, { type: 'quote', id: q.id, title: `Teklif ${q.documentNo}`, subtitle: q.companyName, companyName: q.companyName, stage: q.stage, amount: q.amount, currency: q.currency });
    }
    if (idsByType.company.length && actor.permissions.has('companies.read')) {
      const visibility = await companyVisibilityFilter(this.db, actor);
      const rows = await this.db
        .select({ id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName })
        .from(companies)
        .where(
          and(
            eq(companies.tenantId, actor.tenantId),
            isNull(companies.deletedAt),
            resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
            visibility ?? sql`true`,
            inArray(companies.id, idsByType.company)
          )
        );
      for (const c of rows) map.set(`company:${c.id}`, { type: 'company', id: c.id, title: c.legalTitle, subtitle: c.shortName });
    }
    if (idsByType.service_ticket.length && actor.permissions.has('service_tickets.read')) {
      const visibility = await companyVisibilityExistsFilter(this.db, actor, serviceTickets.companyId);
      const rows = await this.db
        .select({ id: serviceTickets.id, ticketNo: serviceTickets.ticketNo, subject: serviceTickets.subject })
        .from(serviceTickets)
        .where(
          and(
            eq(serviceTickets.tenantId, actor.tenantId),
            isNull(serviceTickets.deletedAt),
            resourceDivisionFilter(actor, 'service_tickets', serviceTickets.divisionId) ?? sql`true`,
            visibility ?? sql`true`,
            inArray(serviceTickets.id, idsByType.service_ticket)
          )
        );
      for (const s of rows) map.set(`service_ticket:${s.id}`, { type: 'service_ticket', id: s.id, title: `Servis ${s.ticketNo}`, subtitle: s.subject });
    }
    if (idsByType.opportunity.length && actor.permissions.has('opportunities.read')) {
      const visibility = await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId);
      const rows = await this.db
        .select({ id: opportunities.id, title: opportunities.title, companyName: companies.legalTitle, stage: pipelineStages.name, amount: opportunities.estimatedValue, currency: currencies.code })
        .from(opportunities)
        .leftJoin(companies, eq(companies.id, opportunities.companyId))
        .leftJoin(pipelineStages, eq(pipelineStages.id, opportunities.currentStageId))
        .leftJoin(currencies, eq(currencies.id, opportunities.currencyId))
        .where(
          and(
            eq(opportunities.tenantId, actor.tenantId),
            isNull(opportunities.deletedAt),
            resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
            visibility ?? sql`true`,
            inArray(opportunities.id, idsByType.opportunity)
          )
        );
      for (const o of rows) map.set(`opportunity:${o.id}`, { type: 'opportunity', id: o.id, title: o.title, subtitle: o.companyName, companyName: o.companyName, stage: o.stage, amount: o.amount, currency: o.currency });
    }
    for (const r of refs) {
      const key = `${r.type}:${r.id}`;
      if (!map.has(key)) map.set(key, { type: r.type, id: r.id, title: 'Kayıt bulunamadı', subtitle: null, missing: true });
    }
    return map;
  }

  private async resolveAttachments(actor: AuthContext, messageIds: string[]): Promise<Map<string, AttachmentDto[]>> {
    const map = new Map<string, AttachmentDto[]>();
    if (messageIds.length === 0) return map;
    const rows = await this.db
      .select({
        entityId: fileLinks.entityId,
        fileId: files.id,
        bucket: files.bucket,
        objectKey: files.objectKey,
        filename: files.originalFilename,
        mimeType: files.mimeType,
        sizeBytes: files.sizeBytes,
      })
      .from(fileLinks)
      .innerJoin(files, eq(fileLinks.fileId, files.id))
      .where(
        and(
          eq(fileLinks.entityType, CHAT_ATTACHMENT_ENTITY),
          inArray(fileLinks.entityId, messageIds),
          eq(fileLinks.tenantId, actor.tenantId),
          isNull(files.deletedAt),
          eq(files.uploadStatus, 'linked')
        )
      );
    for (const r of rows) {
      const list = map.get(r.entityId) ?? [];
      list.push(await this.signChatAttachment(actor, r));
      map.set(r.entityId, list);
    }
    return map;
  }

  private async signChatAttachment(
    actor: AuthContext,
    row: Omit<AttachmentDto, 'url' | 'isImage'> & { bucket: string; objectKey: string },
  ): Promise<AttachmentDto> {
    const url = await this.storage.getSignedDownloadUrl({
      actorTenantId: actor.tenantId,
      bucket: row.bucket,
      objectKey: row.objectKey,
    });
    return {
      fileId: row.fileId,
      url,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      isImage: row.mimeType.startsWith('image/'),
    };
  }
}
