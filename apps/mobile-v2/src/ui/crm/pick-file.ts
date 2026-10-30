import * as DocumentPicker from 'expo-document-picker';
import * as LegacyFileSystem from 'expo-file-system/legacy';

export type PickedBase64File = { fileName: string; mimeType: string; sizeBytes: number | null; fileBase64: string };

/**
 * İçe aktarma ekranları için tek dosya seçer ve base64 okur. `validate` hata
 * metni dönerse dosya okunmadan reddedilir (boyut/uzantı sunucuya gitmeden).
 */
export async function pickBase64File(options: {
  types: string[];
  fallbackMimeType: string;
  validate: (file: { name: string; size: number | null }) => string | null;
}): Promise<{ file: PickedBase64File } | { error: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: options.types, copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const size = typeof asset.size === 'number' ? asset.size : null;
  const error = options.validate({ name: asset.name, size });
  if (error) return { error };
  const fileBase64 = await LegacyFileSystem.readAsStringAsync(asset.uri, { encoding: LegacyFileSystem.EncodingType.Base64 });
  return {
    file: { fileName: asset.name, mimeType: asset.mimeType || options.fallbackMimeType, sizeBytes: size, fileBase64 },
  };
}
