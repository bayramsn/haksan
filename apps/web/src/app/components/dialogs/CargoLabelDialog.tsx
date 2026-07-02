import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Combobox } from "../ui/combobox";
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

export function printCargoLabelForCustomer(customer: CargoLabelCustomer) {
  const doc = cargoLabelDoc(
    {
      firma: cargoLabelCompanyName(customer),
      adres: customer.address,
      ilce: customer.district,
      sehir: customer.city,
      tel: customer.phone,
    },
    printAssetBase(),
  );

  printOrWarn(doc);
}

export function PrintCargoLabelDialog() {
  const { customers } = useStore();
  const [open, setOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find(c => c.id === selectedCustomerId);
    if (!cust) return;

    printCargoLabelForCustomer(cust);
    setOpen(false);
    setSelectedCustomerId("");
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
                onChange={setSelectedCustomerId}
                placeholder="Firma seçin veya arayın..."
                searchPlaceholder="Firma adı / şehir ara..."
                emptyText="Firma bulunamadı."
              />
            </div>
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
