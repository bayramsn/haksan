import { MAIL_MAX_ATTACHMENTS, MAIL_MAX_ATTACHMENT_BYTES } from '@haksan/shared';
export function validateMailAttachment(existing: { sizeBytes: number }[], local: { sizeBytes: number; extension: string }): string | null {
  if (!['pdf', 'docx', 'xlsx', 'png', 'jpg', 'jpeg', 'webp'].includes(local.extension.toLowerCase())) return 'PDF, DOCX, XLSX, PNG, JPG veya WEBP ekleyebilirsiniz.';
  if (existing.length >= MAIL_MAX_ATTACHMENTS) return `En fazla ${MAIL_MAX_ATTACHMENTS} dosya eklenebilir`;
  if (!Number.isFinite(local.sizeBytes) || local.sizeBytes <= 0) return 'Dosya boş veya okunamıyor.';
  if (existing.some(item => !Number.isFinite(item.sizeBytes) || item.sizeBytes < 0)) return 'Mevcut eklerin boyutu okunamıyor. Ekleri yeniden seçin.';
  if (existing.reduce((sum, item) => sum + item.sizeBytes, 0) + local.sizeBytes > MAIL_MAX_ATTACHMENT_BYTES) return `Eklerin toplamı ${Math.round(MAIL_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB’ı aşamaz.`;
  return null;
}
