/** Web servis teklifleri aynı note-template kimliğini metadata içinde saklar. */
export const SERVICE_QUOTE_TEMPLATE_SCOPE = 'service_quote';
const PREFIX = 'note-template:';
export const serviceNoteTemplateKey = (id: string) => `${PREFIX}${id}`;
export const serviceNoteTemplateId = (key: string) => key.startsWith(PREFIX) ? key.slice(PREFIX.length) : null;
export const serviceNoteLines = (body: string) => body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
export const serviceNoteBody = (notes: string[]) => notes.map((note) => note.trim()).filter(Boolean).join('\n');
export function serviceTemplateValidation(title: string, body: string): string | null {
  if (!title.trim()) return 'Şablon başlığı girin.';
  if (title.trim().length > 200) return 'Şablon başlığı en fazla 200 karakter olabilir.';
  if (!body.trim()) return 'Önce teklif notu girin.';
  if (body.length > 12000) return 'Şablon metni en fazla 12.000 karakter olabilir.';
  return null;
}
