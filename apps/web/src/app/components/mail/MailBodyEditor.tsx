import { useEffect, useRef } from 'react';
import { Bold } from 'lucide-react';
import { MAIL_TEXT_COLOR, mailTextParts } from '@haksan/shared';
import { Button } from '../ui/button';

/** Serialize only text and bold, never paste HTML or browser styles into a mail. */
export function serializeMailEditor(root: HTMLElement): string {
  const parts: { text: string; bold: boolean }[] = [];
  const append = (text: string, bold: boolean) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.bold === bold) last.text += text;
    else parts.push({ text, bold });
  };
  const walk = (node: Node, inheritedBold = false): void => {
    if (node.nodeType === Node.TEXT_NODE) { append(node.textContent ?? '', inheritedBold); return; }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') { append('\n', inheritedBold); return; }
    const weight = node.style.fontWeight;
    const bold = weight === 'normal' || weight === '400' ? false : ['B', 'STRONG'].includes(node.tagName) || weight === 'bold' || Number(weight) >= 600 || inheritedBold;
    for (const child of Array.from(node.childNodes)) {
      const last = parts.at(-1);
      if (child instanceof HTMLElement && ['DIV', 'P'].includes(child.tagName) && last && !last.text.endsWith('\n')) append('\n', bold);
      walk(child, bold);
    }
  };
  walk(root);
  return parts.map((part) => part.bold ? `**${part.text}**` : part.text).join('');
}

export function MailBodyEditor({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || serializeMailEditor(root) === value) return;
    const nodes = mailTextParts(value).map((part) => {
      if (!part.bold) return document.createTextNode(part.text);
      const strong = document.createElement('strong');
      strong.textContent = part.text;
      return strong;
    });
    root.replaceChildren(...nodes);
  }, [value]);

  const update = () => {
    if (ref.current) onChange(serializeMailEditor(ref.current));
  };
  return <div className="mt-1 overflow-hidden rounded-md border border-input bg-white">
    <div className="flex items-center gap-3 border-b px-2 py-1">
      <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label="Seçili metni kalınlaştır" title="Kalın (Ctrl/Cmd+B)"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { ref.current?.focus(); document.execCommand('bold'); update(); }}><Bold className="size-4" /></Button>
      <span className="text-xs text-muted-foreground">Standart lacivert · Arial</span>
    </div>
    <div id="compose-mail-body" ref={ref} role="textbox" aria-label="Mesaj" aria-multiline="true" aria-disabled={disabled}
      contentEditable={!disabled} suppressContentEditableWarning
      className="min-h-52 whitespace-pre-wrap break-words px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ color: MAIL_TEXT_COLOR, fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 14, lineHeight: 1.6 }}
      onInput={update}
      onPaste={(event) => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); update(); }}
      onDrop={(event) => event.preventDefault()}
    />
  </div>;
}
