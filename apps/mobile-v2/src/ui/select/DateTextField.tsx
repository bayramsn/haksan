import { DateTimeField } from '@/src/ui/pickers/DateTimeField';
import { formatDateText, parseDateText } from './select-logic';

/**
 * Metin tutan formlar için takvim seçici: değer `YYYY-AA-GG` (ya da `datetime`
 * modunda `YYYY-AA-GG SS:DD`) olarak okunur ve yazılır, elle tarih yazılmaz.
 */
export function DateTextField({
  label,
  value,
  onChangeText,
  mode = 'date',
  placeholder,
  error,
  clearable = true,
  disabled,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  mode?: 'date' | 'datetime';
  placeholder?: string;
  error?: string;
  clearable?: boolean;
  disabled?: boolean;
}) {
  return (
    <DateTimeField
      label={label}
      mode={mode}
      value={parseDateText(value)}
      onChange={(date) => onChangeText(date ? formatDateText(date, mode) : '')}
      placeholder={placeholder ?? (mode === 'date' ? 'Tarih seçin' : 'Tarih ve saat seçin')}
      error={error}
      clearable={clearable}
      disabled={disabled}
    />
  );
}
