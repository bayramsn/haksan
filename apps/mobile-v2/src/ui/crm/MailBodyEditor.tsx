import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { mailTextParts, MAIL_TEXT_COLOR } from '@haksan/shared';
import { Button } from '@/src/ui';
import { useTheme } from '@/src/theme/theme';
import { toast } from '@/src/ui/toast';
import { toggleMailBold } from './mail-format-edit';

export function MailBodyEditor({ value, onChange, disabled, maxLength = 10_000 }: { value: string; onChange: (value: string) => void; disabled?: boolean; maxLength?: number }) {
  const { colors } = useTheme();
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [preview, setPreview] = useState(false);
  const input = useRef<TextInput>(null);
  return <View className="gap-2">
    <View className="flex-row flex-wrap gap-2">
      <Button label="Kalın" variant="ghost" disabled={disabled || preview || selection.start === selection.end} accessibilityHint="Önce mesajda biçimlendirmek istediğiniz metni seçin" onPress={() => {
        try { const result = toggleMailBold(value, selection, maxLength); if (result) { onChange(result.value); setSelection(result.selection); input.current?.focus(); } }
        catch (error) { toast.error(error instanceof Error ? error.message : 'Metin biçimlendirilemedi.'); }
      }} />
      <Button label={preview ? 'Düzenle' : 'Önizle'} variant="ghost" disabled={disabled} onPress={() => setPreview(current => !current)} />
    </View>
    {preview ? <View className="min-h-[180px] rounded-control border border-border bg-white p-3.5">
      <Text selectable style={{ color: MAIL_TEXT_COLOR, fontFamily: 'Arial', fontSize: 14, lineHeight: 23 }}>{mailTextParts(value).map((part, index) => <Text key={index} style={{ fontWeight: part.bold ? '700' : '400' }}>{part.text}</Text>)}</Text>
    </View> : <TextInput ref={input} accessibilityLabel="Mesaj" value={value} onChangeText={onChange} onSelectionChange={event => setSelection(event.nativeEvent.selection)} selection={selection} multiline editable={!disabled} textAlignVertical="top" placeholderTextColor={colors.mutedForeground} className="min-h-[180px] rounded-control bg-input-background px-3.5 py-3 font-inter text-base text-foreground" />}
    <Text className="font-inter text-xs text-muted-foreground">Metni seçip Kalın’a dokunun. Önizleme, web e-postasıyla aynı metin biçimini gösterir.</Text>
  </View>;
}
