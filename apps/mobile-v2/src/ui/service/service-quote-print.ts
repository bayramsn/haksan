import type { QuoteContext, ServiceQuote } from './serviceForms';

export function escapeServiceQuoteHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Yalnız küçük, gerçek raster imzalar; URL, SVG ve etkin içerik kabul edilmez. */
export function safeServiceSignatureImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_800_000) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  const encoded = match?.[2];
  if (!match || !encoded || encoded.length % 4 !== 0) return null;
  try {
    const bytes = atob(encoded.slice(0, 32));
    const kind = match[1];
    const valid = kind === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n')
      : kind === 'jpeg' ? bytes.startsWith('\xff\xd8\xff')
      : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    return valid ? value : null;
  } catch { return null; }
}

/** Web serviceQuoteDoc alanları; saklanan formdan, dış kaynak yüklemeden hazırlanır. */
export function serviceQuotePrintHtml(quote: ServiceQuote, machine?: QuoteContext['machine']): string {
  const esc = escapeServiceQuoteHtml;
  const number = (value: number) => Number.isFinite(value) ? value : 0;
  const money = (value: number) => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number(value))} ${esc(quote.currency)}`;
  const items = quote.items.filter((item) => item.description.trim());
  const subtotal = items.reduce((sum, item) => sum + number(item.quantity) * number(item.unitPrice), 0);
  const vat = number(quote.vatAmount) > 0 ? number(quote.vatAmount) : subtotal * number(quote.vatRate) / 100;
  const image = safeServiceSignatureImage(quote.signature?.imageUrl);
  const row = (label: string, value: unknown) => `<div class="info"><b>${esc(label)}</b><span>${esc(value) || '—'}</span></div>`;
  const machineLabel = machine ? [machine.brand, machine.model, machine.type].filter(Boolean).join(' · ') : '';
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(quote.date);
  const date = dateMatch ? `${dateMatch[3]}.${dateMatch[2]}.${dateMatch[1]}` : quote.date;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${esc(quote.quoteNo)} — Servis Teklifi</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#14213a;margin:0;line-height:1.5}h1{font-size:22px;margin:0;color:#14336c}h2{font-size:14px;border-bottom:1px solid #c6cdd8;padding-bottom:6px;margin-top:24px}.brand{font-size:18px;font-weight:bold;color:#c71925}.header{border-bottom:3px solid #14336c;padding-bottom:12px;margin-bottom:18px}.columns{display:flex;gap:24px}.columns>section{flex:1;min-width:0}.info{margin:5px 0;display:flex;gap:12px}.info b{width:90px;flex-shrink:0}.info span,.subject,li,td{overflow-wrap:anywhere;white-space:pre-wrap}.subject{margin:18px 0;padding:10px;background:#f1f4f8}table{border-collapse:collapse;width:100%;margin-top:14px}thead{display:table-header-group}th,td{border:1px solid #c6cdd8;padding:8px;text-align:left;vertical-align:top}th{background:#edf1f7}tr{break-inside:avoid;page-break-inside:avoid}.numeric{text-align:right}.totals{margin-left:auto;width:55%;break-inside:avoid}.totals td{border:0;border-bottom:1px solid #c6cdd8}.grand{font-weight:bold;background:#edf1f7}.signature{margin-top:26px;display:flex;gap:28px;break-inside:avoid}.signature>div{flex:1}.signature img{max-width:140px;max-height:85px;object-fit:contain}.signature h2{margin-top:0}li{padding:3px 0}footer{margin-top:24px;border-top:1px solid #c6cdd8;padding-top:8px;color:#526078}
</style></head><body><header class="header"><div class="brand">HAKSAN MAKİNA</div><h1>SERVİS FİYAT TEKLİFİ</h1></header>
<div class="columns"><section>${row('Firma', quote.company)}${row('İlgili', quote.contact)}${row('Mobil', quote.mobile)}${row('Telefon', quote.phone)}${row('E-posta', quote.email)}${row('Adres', quote.address)}</section><section>${row('Teklif No.', quote.quoteNo)}${row('Tarih', date)}${row('Geçerlilik', quote.validity)}${row('Teklifi Yazan', quote.writerName)}${row('Unvan', quote.writerTitle)}${row('E-posta', quote.writerEmail)}</section></div>
${machineLabel || machine?.serialNumber ? `<section><h2>Makine Bilgileri</h2>${row('Makine', machineLabel)}${row('Seri No.', machine?.serialNumber)}</section>` : ''}
<div class="subject">${esc(quote.subject)}</div><table><thead><tr><th>No.</th><th>Ürün / Hizmet Açıklaması</th><th>Miktar</th><th>Birim Fiyat</th><th>Tutar</th></tr></thead><tbody>${items.map((item, index) => `<tr><td>${index + 1}</td><td>${esc(item.description)}</td><td>${esc(number(item.quantity))} ${esc(item.unit)}</td><td class="numeric">${money(item.unitPrice)}</td><td class="numeric">${money(number(item.quantity) * number(item.unitPrice))}</td></tr>`).join('')}</tbody></table>
<table class="totals"><tbody><tr><td>Ara Toplam</td><td class="numeric">${money(subtotal)}</td></tr><tr><td>K.D.V. (%${esc(number(quote.vatRate))})</td><td class="numeric">${money(vat)}</td></tr><tr class="grand"><td>Toplam</td><td class="numeric">${money(subtotal + vat)}</td></tr></tbody></table>
${quote.notes.some((note) => note.trim()) ? `<section><h2>Notlar</h2><ol>${quote.notes.filter((note) => note.trim()).map((note) => `<li>${esc(note)}</li>`).join('')}</ol></section>` : ''}
<section class="signature"><div><h2>İlgili Kişi</h2><b>${esc(quote.signature?.name ?? quote.writerName)}</b><div>${esc(quote.signature?.title ?? quote.writerTitle)}</div>${image ? `<img src="${image}" alt="Belge imzası">` : ''}<div>${esc(quote.writerEmail)}</div></div><div><h2>Müşteri Onayı</h2><p>KAŞE + İMZA</p></div></section><footer>${esc(quote.quoteNo)} · ${esc(quote.company)}</footer></body></html>`;
}
