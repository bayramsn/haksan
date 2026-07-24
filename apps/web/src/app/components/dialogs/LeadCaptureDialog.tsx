import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "../../lib/store";
import { useAuth } from "../../../lib/auth";
import { companyService, contactService, opportunityService } from "../../../lib/services";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

/**
 * Firma bilgisi bilinmeyen bir talebi tek adımda teklif kartına (fırsat) çevirir.
 * Girilen isim/telefon ile "potansiyel" bir firma + kontak oluşturur ve fırsatı
 * "lead" aşamasında ilgili bölüme açar. Kazan/kayıp mevcut Kanban akışıyla ilerler.
 */
export function LeadCaptureDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { refresh } = useStore();
  const { user, activeDivision } = useAuth();
  const divisions = user?.divisions ?? [];
  const defaultDivision = activeDivision && activeDivision !== "all"
    ? activeDivision
    : divisions.find((d) => d.isPrimary)?.id ?? divisions[0]?.id ?? "";

  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [divisionId, setDivisionId] = useState(defaultDivision);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFirstName(""); setLastName(""); setPhone(""); setProduct(""); setQuantity("1");
    setDivisionId(defaultDivision);
  };

  const fullName = `${firstName} ${lastName}`.trim();
  const qtyNum = Number(quantity) > 0 ? Math.floor(Number(quantity)) : 0;
  const canSubmit = fullName.length > 0 && product.trim().length > 0 && (divisions.length === 0 || !!divisionId);

  const submit = async () => {
    if (!canSubmit) {
      toast.error("Eksik bilgi", { description: "İsim ve istenen ürün zorunludur." });
      return;
    }
    setSaving(true);
    try {
      const divisionArg = divisionId || undefined;
      // 1) Potansiyel firma (unvan = kişi adı; firma henüz bilinmiyor)
      const company = await companyService.create({
        companyType: "company",
        relationTypeCode: "customer",
        customerStatusCode: "potential",
        legalTitle: fullName,
        divisionId: divisionArg,
        notes: "Hızlı lead — firma bilgisi girişte bilinmiyordu.",
      } as any);
      // 2) Kişi kartı (isim + telefon)
      const contact = await contactService.create({
        companyId: company.id,
        fullName,
        mobilePhone: phone.trim() || undefined,
        isPrimary: true,
      } as any);
      // 3) Fırsat (teklif kartı) — "lead" aşamasında, ilgili bölüme
      const title = qtyNum > 0 ? `${product.trim()} (${qtyNum} adet)` : product.trim();
      await opportunityService.create({
        companyId: company.id,
        primaryContactId: contact.id,
        title,
        description: [
          `İstenen ürün: ${product.trim()}`,
          qtyNum > 0 ? `Adet: ${qtyNum}` : null,
          phone.trim() ? `Telefon: ${phone.trim()}` : null,
          "Kaynak: Hızlı lead (firma bilinmiyordu).",
        ].filter(Boolean).join("\n"),
        divisionId: divisionArg,
        currencyCode: "USD",
      } as any);

      await refresh();
      toast.success("Lead teklif kartı oluşturuldu", { description: `${fullName} · ${title}` });
      reset();
      setOpen(false);
    } catch (error: unknown) {
      toast.error("Lead oluşturulamadı", {
        description: error instanceof Error ? error.message : "İstek başarısız oldu.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setDivisionId(defaultDivision); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" className="h-9 gap-1.5">
            <UserPlus className="size-4" /> Hızlı Lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[min(560px,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" /> Hızlı Lead — Firma Bilinmiyor
          </DialogTitle>
          <DialogDescription>
            Kişi ve istenen ürün bilgisiyle "lead" aşamasında bir teklif kartı açılır. Firma "potansiyel" olarak kaydedilir; teklif olumluysa ilgili alanlar sonradan doldurulur.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lead-first">Ad</Label>
              <Input id="lead-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Ahmet" />
            </div>
            <div>
              <Label htmlFor="lead-last">Soyad</Label>
              <Input id="lead-last" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Yılmaz" />
            </div>
          </div>
          <div>
            <Label htmlFor="lead-phone">Telefon</Label>
            <Input id="lead-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" />
          </div>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <div>
              <Label htmlFor="lead-product">İstenen ürün</Label>
              <Input id="lead-product" value={product} onChange={(e) => setProduct(e.target.value)} placeholder="İşleme Merkezi" />
            </div>
            <div>
              <Label htmlFor="lead-qty">Adet</Label>
              <Input id="lead-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" />
            </div>
          </div>
          {divisions.length > 1 && (
            <div>
              <Label>Bölüm</Label>
              <Select value={divisionId} onValueChange={setDivisionId}>
                <SelectTrigger><SelectValue placeholder="Bölüm seçin" /></SelectTrigger>
                <SelectContent>
                  {divisions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Vazgeç</Button>
          <Button type="button" onClick={() => void submit()} disabled={saving || !canSubmit}>
            {saving ? "Oluşturuluyor…" : "Lead Kartı Oluştur"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
