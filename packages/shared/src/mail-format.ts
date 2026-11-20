export const MAIL_TEXT_COLOR = '#17365d';

/** Only bold markers are interpreted. HTML always remains ordinary text. */
export function mailTextParts(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[\s\S]+?\*\*)/g).filter(Boolean).map((part) => ({
    text: part.startsWith('**') && part.endsWith('**') ? part.slice(2, -2) : part,
    bold: part.startsWith('**') && part.endsWith('**'),
  }));
}

export function mailPlainText(text: string): string {
  return mailTextParts(text).map((part) => part.text).join('');
}

export function mailBodyHtml(text: string, signatureCid?: string): string {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const content = mailTextParts(text.replace(/\r\n?/g, '\n')).map((part) => {
    const escaped = escape(part.text).replace(/\n/g, '<br>');
    return part.bold ? `<strong>${escaped}</strong>` : escaped;
  }).join('');
  return `<html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${MAIL_TEXT_COLOR};overflow-wrap:break-word">${content}${signatureCid ? `<br><br><img src="cid:${escape(signatureCid)}" alt="E-posta imzası" width="480" style="display:block;width:480px;max-width:100%;height:auto;border:0">` : ''}</div></body></html>`;
}
