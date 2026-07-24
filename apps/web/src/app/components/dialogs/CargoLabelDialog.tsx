import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Combobox } from "../ui/combobox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useStore } from "../../lib/store";
import type { Customer } from "../../lib/mock";
import { Printer } from "lucide-react";
import { printOrWarn } from "../../lib/pageHelpers";
import { cargoLabelDoc, printAssetBase } from "../../lib/print";

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
  const { customers } = useStore();
  const [open, setOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [phone, setPhone] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find(c => c.id === selectedCustomerId);
    if (!cust) return;

    printCargoLabelForCustomer(cust, phone);
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
              <Combobox
                options={customers.map((c) => ({ value: c.id, label: c.name, hint: c.city }))}
                value={selectedCustomerId}
                onChange={(value) => {
                  setSelectedCustomerId(value);
                  setPhone(customers.find((customer) => customer.id === value)?.phone ?? "");
                }}
                placeholder="Firma seçin veya arayın..."
                searchPlaceholder="Firma adı / şehir ara..."
                emptyText="Firma bulunamadı."
              />
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
            <Button type="submit" disabled={!selectedCustomerId}>Yazdır</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
