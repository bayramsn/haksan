import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Cihazda üretilen metin raporunu (CSV/HTML) cache'e yazıp paylaşım sayfasını açar; ağ isteği yok. */
export async function shareTextFile(input: { fileName: string; content: string; mimeType: string; uti?: string; title: string }): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda dosya paylaşımı kullanılamıyor.');
  const safeName = input.fileName.replace(/[^\w.\-]+/g, '_');
  const file = new File(Paths.cache, safeName);
  file.create({ overwrite: true, intermediates: true });
  file.write(input.content);
  await Sharing.shareAsync(file.uri, { mimeType: input.mimeType, UTI: input.uti, dialogTitle: input.title });
}
