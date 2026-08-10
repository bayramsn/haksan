import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import type { Customer } from "../../lib/mock";
import { Printer } from "lucide-react";
import { printOrWarn } from "../../lib/pageHelpers";
import { cargoLabelDoc, printAssetBase } from "../../lib/print";
import { RemoteCompanyCombobox } from "../shared/RemoteCompanyCombobox";
import { useCompanyDetail } from "../../lib/companyServerData";

type CargoLabelCustomer = Pick<Customer, "name" | "address" | "district" | "city" | "phone"> & {
  legalTitle?: string | null;
  shortName?: string | null;
};

const cargoLabelCompanyName = (customer: CargoLabelCustomer) =>
  customer.legalTitle || customer.shortName || customer.name;

export function printCargoLabelForCustomer(customer: CargoLabelCustomer, phoneOverride?: string) {
  const doc = cargoLabelDoc(
    {
      firma: cargoLabelCompanyName(customer),
      adres: customer.address,
      ilce: customer.district,
      sehir: customer.city,
      tel: phoneOverride?.trim() || customer.phone,
    },
    printAssetBase(),
  );

  printOrWarn(doc);
}

export function PrintCargoLabelDialog() {
  const [open, setOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [phone, setPhone] = useState("");
  const selectedCompanyQuery = useCompanyDetail(selectedCustomerId);
  const selectedCompany = selectedCompanyQuery.data;

  useEffect(() => {
    if (selectedCompany?.id !== selectedCustomerId) return;
    setPhone(selectedCompany.phone ?? "");
  }, [selectedCompany?.id, selectedCompany?.phone, selectedCustomerId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;

    printCargoLabelForCustomer(selectedCompany, phone);
    setOpen(false);
    setSelectedCustomerId("");
    setPhone("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1">
          <Printer className="size-4" /> Etiket Yazdır
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kargo Etiketi Yazdır</DialogTitle>
          <DialogDescription>
            Etiketi yazdırılacak firmayı seçiniz.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4 pt-2">
          <div>
            <Label className="text-xs">Firma</Label>
            <div className="mt-1.5">
              <RemoteCompanyCombobox
                value={selectedCustomerId}
                onValueChange={(companyId) => {
                  setSelectedCustomerId(companyId);
                  setPhone("");
                }}
                placeholder="Firma seçin veya arayın..."
                searchPlaceholder="Firma adı, no veya vergi no ara..."
              />
              {selectedCompanyQuery.isError && (
                <p className="mt-1 text-[11px] text-destructive">Firma bilgileri alınamadı. Tekrar seçim yapın.</p>
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs" htmlFor="cargo-label-phone">Alıcı Telefonu</Label>
            <Input
              id="cargo-label-phone"
              className="mt-1.5"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Örn. 0 (212) 000 00 00"
              inputMode="tel"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Etikette yazacak numarayı bu baskı için değiştirebilirsiniz.</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" disabled={!selectedCustomerId || !selectedCompany}>Yazdır</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
