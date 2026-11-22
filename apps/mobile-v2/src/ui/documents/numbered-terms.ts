export function markedTerms(value: string, style: 'alpha' | 'decimal', start = 0) {
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((text, index) => {
    let number = start + index, alpha = '';
    do { alpha = String.fromCharCode(97 + number % 26) + alpha; number = Math.floor(number / 26) - 1; } while (number >= 0);
    return { marker: style === 'alpha' ? `${alpha}.` : `${start + index + 1}.`, text };
  });
}
