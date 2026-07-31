import { z } from 'zod';

export const conversationTypeSchema = z.enum(['dm', 'group']);
export type ConversationType = z.infer<typeof conversationTypeSchema>;

export const chatMemberRoleSchema = z.enum(['admin', 'member']);
export type ChatMemberRole = z.infer<typeof chatMemberRoleSchema>;

/** İki çalışan arası DM'i bul-veya-oluştur. */
export const createDmSchema = z.object({
  userId: z.string().uuid(),
});
export type CreateDmInput = z.infer<typeof createDmSchema>;

/** Grup kurma (yalnız süper admin). Kurucu otomatik admin üye olur. */
export const createGroupSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  memberUserIds: z.array(z.string().uuid()).default([]),
  onlyAdminsCanPost: z.boolean().default(true),
  avatarFileId: z.string().uuid().optional(),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/** Grup ayarlarını güncelle (süper admin veya grup admini). */
export const updateGroupSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  onlyAdminsCanPost: z.boolean().optional(),
  avatarFileId: z.string().uuid().nullable().optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
});
export type AddMembersInput = z.infer<typeof addMembersSchema>;

export const setMemberRoleSchema = z.object({
  role: chatMemberRoleSchema,
});
export type SetMemberRoleInput = z.infer<typeof setMemberRoleSchema>;

/** Sohbette paylaşılabilen CRM kayıt türleri (kart olarak iliştirilir). */
export const chatRefTypeSchema = z.enum(['quote', 'company', 'service_ticket', 'opportunity']);
export type ChatRefType = z.infer<typeof chatRefTypeSchema>;

/** Tarayıcıdan paylaşılan tek bir coğrafi konum. */
export const chatLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  label: z.string().trim().min(1).max(255).optional(),
});
export type ChatLocation = z.infer<typeof chatLocationSchema>;

/** Mesaj gönder: metin, ekler, yanıt ve/veya CRM kaydı kartı. En az biri gerekli. */
export const sendMessageSchema = z
  .object({
    body: z.string().max(4000).optional(),
    attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
    replyToId: z.string().uuid().optional(),
    refType: chatRefTypeSchema.optional(),
    refId: z.string().uuid().optional(),
    location: chatLocationSchema.optional(),
  })
  .refine(
    (v) =>
      (v.body?.trim().length ?? 0) > 0 ||
      (v.attachmentFileIds?.length ?? 0) > 0 ||
      !!v.location ||
      (!!v.refType && !!v.refId),
    { message: 'Mesaj boş olamaz (metin, ek, konum veya kayıt gerekli)', path: ['body'] }
  )
  .refine((v) => (!!v.refType) === (!!v.refId), {
    message: 'refType ve refId birlikte verilmeli',
    path: ['refId'],
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/** Mesaj metnini düzenle. */
export const editMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});
export type EditMessageInput = z.infer<typeof editMessageSchema>;

/** Emoji tepkisi ekle/kaldır (toggle). */
export const reactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});
export type ReactionInput = z.infer<typeof reactionSchema>;

/** Mesaj sayfalama: `before` = yüklü en eski mesajın createdAt ISO değeri (cursor). */
export const messagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().min(2).max(100).optional(),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;
