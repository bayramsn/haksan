import type { ContractClausesInput } from "@haksan/shared";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

type Props = {
  value: ContractClausesInput;
  onChange: (next: ContractClausesInput) => void;
  disabled?: boolean;
};

const TOGGLES: Array<["inStock" | "leasingDelivery" | "investmentIncentive" | "exchangeRateDifference", string]> = [
  ["inStock", "Tezgah stoktan teslim (teslim süresi yerine stok maddesi)"],
  ["leasingDelivery", "Leasing firmasına teslim (fatura ve nakliye leasing firmasına)"],
  ["investmentIncentive", "Yatırım Teşvik Belgesi maddesi"],
  ["exchangeRateDifference", "Kur farkı maddesi"],
];

/** Sözleşme çıktısındaki isteğe bağlı maddeler — dört diyalogda ortak. */
export function ContractClausesFields({ value, onChange, disabled }: Props) {
  const tradeIn = value.tradeIn ?? null;
  const setTradeIn = (patch: Partial<NonNullable<ContractClausesInput["tradeIn"]>>) =>
    onChange({ ...value, tradeIn: { description: "", amount: 0, plusVat: true, ...tradeIn, ...patch } });

  return (
    <div className="grid gap-2">
      {TOGGLES.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Switch checked={Boolean(value[key])} onCheckedChange={(checked) => onChange({ ...value, [key]: checked })} disabled={disabled} />
          {label}
        </label>
      ))}
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Switch
          checked={tradeIn !== null}
          onCheckedChange={(checked) => onChange({ ...value, tradeIn: checked ? { description: "", amount: 0, plusVat: true } : null })}
          disabled={disabled}
        />
        Takas tezgah var
      </label>
      {tradeIn && (
        <div className="grid gap-2 pl-10 sm:grid-cols-2">
          <Input className="sm:col-span-2" placeholder="Takas tezgah (ör. Kullanılmış VM-2 Cnc Dik İşleme Merkezi)" value={tradeIn.description} onChange={(e) => setTradeIn({ description: e.target.value })} disabled={disabled} maxLength={300} />
          <Input type="number" min={0} step="0.01" placeholder="Takas bedeli" value={tradeIn.amount || ""} onChange={(e) => setTradeIn({ amount: Number(e.target.value) || 0 })} disabled={disabled} />
          <Input placeholder="Teslim alınacak yer (ör. Zeytinburnu)" value={tradeIn.pickupLocation ?? ""} onChange={(e) => setTradeIn({ pickupLocation: e.target.value })} disabled={disabled} maxLength={200} />
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground sm:col-span-2">
            <Switch checked={tradeIn.plusVat !== false} onCheckedChange={(checked) => setTradeIn({ plusVat: checked })} disabled={disabled} />
            Takas bedeli + K.D.V.
          </label>
        </div>
      )}
    </div>
  );
}

/** Boş takas satırını (açıklama veya tutar yok) kayda göndermez. */
export function cleanContractClauses(value: ContractClausesInput): ContractClausesInput {
  const tradeIn = value.tradeIn;
  return { ...value, tradeIn: tradeIn && tradeIn.description.trim() && tradeIn.amount > 0 ? { ...tradeIn, description: tradeIn.description.trim() } : null };
}
