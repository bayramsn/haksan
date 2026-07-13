import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useStore } from "../../lib/store";

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
};

export function ReferencesPage() {
  const { machines, customers, contacts } = useStore();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const primaryContactByCustomer = new Map(
      contacts
        .filter((contact) => contact.isPrimary)
        .map((contact) => [contact.customerId, contact.name]),
    );

    return machines
      .map((machine) => {
        const customer = customers.find((item) => item.id === (machine.initialCustomerId ?? machine.customerId));
        return {
          id: machine.id,
          firm: customer?.name ?? "—",
          contact: primaryContactByCustomer.get(customer?.id ?? "") ?? customer?.contactPerson ?? "—",
          district: customer?.district ?? "—",
          city: customer?.city ?? "—",
          brand: machine.brand || "—",
          model: machine.model || "—",
          deliveryDate: machine.deliveryDate || machine.installationDate,
        };
      })
      .sort((a, b) => (b.deliveryDate || "").localeCompare(a.deliveryDate || ""));
  }, [contacts, customers, machines]);

  const filtered = rows.filter((row) => {
    const needle = q.toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [row.firm, row.contact, row.district, row.city, row.brand, row.model]
      .some((value) => value.toLocaleLowerCase("tr-TR").includes(needle));
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          Toplam <span className="font-medium text-foreground">{filtered.length}</span> referans
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Firma, il, marka veya model ara..."
            className="h-9 pl-9 bg-white"
          />
        </div>
      </div>

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-20">Sıra No</TableHead>
                <TableHead>Firma</TableHead>
                <TableHead>İlgili</TableHead>
                <TableHead>İlçe</TableHead>
                <TableHead>İl</TableHead>
                <TableHead>Tezgah Markası</TableHead>
                <TableHead>Tezgah Modeli</TableHead>
                <TableHead>Teslim Tarihi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{row.firm}</TableCell>
                  <TableCell>{row.contact}</TableCell>
                  <TableCell className="text-muted-foreground">{row.district}</TableCell>
                  <TableCell className="text-muted-foreground">{row.city}</TableCell>
                  <TableCell>{row.brand}</TableCell>
                  <TableCell>{row.model}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(row.deliveryDate)}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                    Referans kaydı bulunamadı.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
