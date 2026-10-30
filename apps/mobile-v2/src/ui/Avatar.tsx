import { Text, View } from 'react-native';

/** "Ahmet Yılmaz" -> "AY". Tek kelimede ilk iki harf. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr');
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase('tr');
}

/**
 * Ad-soyad baş harfli avatar. Sunucu profil fotoğrafı dönmediği için tasarımdaki
 * fotoğraf yerine harfler kullanılıyor (renk addan türetilir, aynı kişi hep aynı).
 */
const PALETTE = ['#000c69', '#2457d6', '#087f5b', '#7c3aed', '#b45309', '#be123c'];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

export function Avatar({ name, size = 44, square }: { name: string; size?: number; square?: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: colorFor(name),
        // Firma satırlarında mockup daire değil yuvarlatılmış kare kullanıyor.
        borderRadius: square ? size * 0.26 : size / 2,
        borderCurve: 'continuous',
      }}
    >
      <Text className="font-inter-semibold text-white" style={{ fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}
