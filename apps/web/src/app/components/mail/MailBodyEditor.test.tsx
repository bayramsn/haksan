// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { serializeMailEditor } from './MailBodyEditor';
import { mailBodyHtml, mailPlainText } from '@haksan/shared';

describe('Mail formatting', () => {
  it('preserves paragraphs and bold selected inside a sentence', () => {
    const root = document.createElement('div');
    root.append('Merhaba,');
    const line = document.createElement('div');
    line.append('Teklifimiz ');
    const bold = document.createElement('b');
    bold.textContent = 'ekte';
    line.append(bold, '.');
    root.append(line);
    const text = serializeMailEditor(root);
    expect(text).toBe('Merhaba,\nTeklifimiz **ekte**.');
    expect(mailPlainText(text)).toBe('Merhaba,\nTeklifimiz ekte.');
    expect(mailBodyHtml(text)).toContain('Merhaba,<br>Teklifimiz <strong>ekte</strong>.');
  });
  it('escapes HTML and preserves blank lines with navy inline styling', () => {
    const html = mailBodyHtml('Merhaba,\r\n\r\n<script>alert(1)</script> **Teklif**');
    expect(html).toContain('color:#17365d');
    expect(html).toContain('Merhaba,<br><br>&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<strong>Teklif</strong>');
  });
  it('embeds only the CID reference for the signature', () => {
    expect(mailBodyHtml('Mesaj', 'signature@haksan')).toContain('src="cid:signature@haksan"');
    expect(mailBodyHtml('Mesaj')).not.toContain('<img');
  });
  it('allows stars within selected bold text', () => {
    expect(mailBodyHtml('**2 * 3**')).toContain('<strong>2 * 3</strong>');
  });
  it('preserves removal of bold from text inside an existing strong element', () => {
    const root = document.createElement('div');
    const strong = document.createElement('strong');
    strong.append('Kalın ');
    const normal = document.createElement('span');
    normal.style.fontWeight = 'normal';
    normal.textContent = 'normal';
    strong.append(normal);
    root.append(strong);
    expect(serializeMailEditor(root)).toBe('**Kalın **normal');
  });
});
