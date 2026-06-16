import { ReactNode } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "./ui/dialog";
import { Mail, Phone, BookOpen, Keyboard } from "lucide-react";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Yeni teklif nasıl oluştururum?",
    a: "Satış kartı detayından veya Teklifler sayfasından 'Teklif Oluştur' ile ilerleyin. Aynı fırsata bağlı her yeni teklif otomatik olarak bir sonraki revizyon (R1, R2, …) numarasını alır.",
  },
  {
    q: "Satış kartına tahsilat nasıl eklerim?",
    a: "Satış kartı detayında 'Ödemeler' sekmesine gidin ve 'Tahsilat ekle' ile vade ve tutarı girin. İsterseniz bir teklife bağlayabilirsiniz.",
  },
  {
    q: "Şirket bilgilerini nereden güncellerim?",
    a: "Ayarlar sayfasındaki 'Şirket Bilgileri' bölümünden. Bu bilgiler tüm kullanıcılarda ortaktır ve yönetici yetkisi gerektirir.",
  },
  {
    q: "Komut paletini nasıl açarım?",
    a: "Klavyeden ⌘K (veya Ctrl+K) ile hızlı arama ve komut paletini açabilirsiniz.",
  },
];

export function HelpCenterDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" /> Yardım Merkezi
          </DialogTitle>
          <DialogDescription>Sık sorulan sorular ve destek iletişim bilgileri.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-lg border border-border/60 p-3">
                <p className="text-sm font-medium">{item.q}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border/60 p-3 space-y-2">
            <p className="text-sm font-medium">Destek</p>
            <a href="mailto:destek@haksan.local" className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Mail className="size-4" /> destek@haksan.local
            </a>
            <a href="tel:+902120000000" className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Phone className="size-4" /> +90 212 000 00 00
            </a>
            <p className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
              <Keyboard className="size-3.5" /> Hızlı arama için ⌘K / Ctrl+K
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
