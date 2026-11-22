/** Bold uses the same plain-text **markers** as the web composer; never stores HTML. */
export function toggleMailBold(value: string, selection: { start: number; end: number }, maxLength = 10_000) {
  const start = Math.max(0, Math.min(value.length, selection.start));
  const end = Math.max(start, Math.min(value.length, selection.end));
  if (start === end) return null;
  const selected = value.slice(start, end);
  if (selected.startsWith('**') && selected.endsWith('**') && selected.length > 4) {
    return { value: value.slice(0, start) + selected.slice(2, -2) + value.slice(end), selection: { start, end: end - 4 } };
  }
  if (start >= 2 && value.slice(start - 2, start) === '**' && value.slice(end, end + 2) === '**') {
    return { value: value.slice(0, start - 2) + selected + value.slice(end + 2), selection: { start: start - 2, end: end - 2 } };
  }
  if (value.length + 4 > maxLength) throw new Error('Kalın biçimlendirme mesajın karakter sınırını aşıyor.');
  return { value: value.slice(0, start) + `**${selected}**` + value.slice(end), selection: { start: start + 2, end: end + 2 } };
}
