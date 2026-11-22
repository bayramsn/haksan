export type PrintRow = { label: string; value?: string | number | null };
export type PrintTable = { headers: string[]; rows: (string | number | null | undefined)[][]; empty?: string };
export type PrintSection = { title: string; rows?: PrintRow[]; lines?: string[]; table?: PrintTable };
export function escapePrintText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}
export function safePrintImage(value?: string | null): string {
  return value && value.length <= 2_800_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : '';
}
/** No customer HTML is interpreted; documents contain only escaped fields and inline images. */
export function printDocument(input: { title: string; subtitle?: string; sections: PrintSection[]; image?: string; signature?: string }): string {
  const image=safePrintImage(input.image), signature=safePrintImage(input.signature);
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>@page{size:A4;margin:16mm}body{font:12px Arial,sans-serif;color:#172033;line-height:1.45}header{border-bottom:3px solid #253d83;padding-bottom:12px}header strong{color:#c82730;font-size:25px}h1{font-size:21px}h2{font-size:15px;margin-top:22px}table{width:100%;border-collapse:collapse}td{padding:7px;border-bottom:1px solid #dde2e9;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}td:first-child{width:35%;font-weight:bold}li{white-space:pre-wrap;margin:7px 0;overflow-wrap:anywhere}img.product{max-width:100%;max-height:240px}img.signature{max-width:220px;max-height:120px}thead{display:table-header-group}th{background:#253d83;color:white;text-align:left;padding:7px}table.data{font-size:10px}table.data td:first-child{width:auto}tr,img{break-inside:avoid}h2{break-after:avoid}footer{margin-top:24px;color:#596579}</style></head><body><header><strong>HAKSAN MAKİNA</strong><div>1972’den bugüne</div></header><h1>${escapePrintText(input.title)}</h1>${input.subtitle ? `<p>${escapePrintText(input.subtitle)}</p>` : ''}${image ? `<img class="product" alt="Ürün" src="${image}">` : ''}${input.sections.map(section=>`<section><h2>${escapePrintText(section.title)}</h2>${section.rows?.length ? `<table>${section.rows.map(row=>`<tr><td>${escapePrintText(row.label)}</td><td>${escapePrintText(row.value ?? '—')}</td></tr>`).join('')}</table>` : ''}${section.table ? printTable(section.table) : ''}${section.lines?.length ? `<ul>${section.lines.map(line=>`<li>${escapePrintText(line)}</li>`).join('')}</ul>` : ''}</section>`).join('')}${signature ? `<img class="signature" alt="İmza" src="${signature}">` : ''}<footer>Haksan Makina</footer></body></html>`;
}

function printTable(table: PrintTable): string {
  return `<table class="data"><thead><tr>${table.headers.map(header => `<th>${escapePrintText(header)}</th>`).join('')}</tr></thead><tbody>${table.rows.length
    ? table.rows.map(row => `<tr>${table.headers.map((_, index) => `<td>${escapePrintText(row[index] ?? '—')}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${table.headers.length}">${escapePrintText(table.empty ?? 'Kayıt yok.')}</td></tr>`}</tbody></table>`;
}
