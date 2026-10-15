import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Button } from '../ui/button';
import { CatalogLibraryDialog } from './CatalogLibraryDialog';
import { ComposeMailDialog, type MailRecipient } from './ComposeMailDialog';

export function CatalogMailButton() {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState<MailRecipient | null>(null);
  return <>
    <Button size="sm" variant="outline" className="h-9 gap-1 whitespace-nowrap" onClick={() => setOpen(true)}><BookOpen className="size-4" />Genel Kataloglar</Button>
    <CatalogLibraryDialog open={open} onOpenChange={setOpen} onSelect={file => {
      setOpen(false);
      setRecipient({ email: '', subject: 'Ürün kataloğu', body: 'Merhaba,\n\nÜrün kataloğumuzu ekte bilgilerinize sunarız.', initialAttachments: [file] });
    }} />
    <ComposeMailDialog recipient={recipient} onOpenChange={value => { if (!value) setRecipient(null); }} />
  </>;
}
