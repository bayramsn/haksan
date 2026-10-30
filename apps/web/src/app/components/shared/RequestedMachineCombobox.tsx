import { useMemo } from "react";
import type { Product } from "../../lib/mock";
import { Combobox } from "../ui/combobox";

const CUSTOM_VALUE = "__requested_machine_custom__";

const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR");

const machineLabel = (product: Product) =>
  [product.brand, product.model].filter(Boolean).join(" ").trim() ||
  product.modelName?.trim() ||
  product.type?.trim() ||
  product.stockCode?.trim() ||
  "Adsız makine";

/**
 * İstenen makine alanı için katalog + serbest metin seçicisi.
 * Popover açıldığında aktif tezgâhların tamamını listeler; Combobox aynı listeyi
 * marka, model, tip ve ürün kodu üzerinden filtreler. Katalog dışı aramalar da
 * fırsata serbest metin olarak kaydedilebilir.
 */
export function RequestedMachineCombobox({
  products,
  value,
  onValueChange,
  disabled,
  className,
}: {
  products: Product[];
  value?: string | null;
  onValueChange: (value: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const currentValue = value?.trim() ?? "";
  const { options, selectedValue } = useMemo(() => {
    const catalogOptions = products
      .filter((product) => (product.categoryCode ?? "").toLocaleUpperCase("en-US") === "TEZGAH")
      .filter((product) => product.status === "active")
      .map((product) => ({
        value: product.id,
        label: machineLabel(product),
        hint: [product.modelName, product.type, product.stockCode].filter(Boolean).join(" · "),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "tr-TR"));

    const catalogMatch = currentValue
      ? catalogOptions.find((option) => normalize(option.label) === normalize(currentValue))
      : undefined;

    if (!currentValue || catalogMatch) {
      return { options: catalogOptions, selectedValue: catalogMatch?.value ?? "" };
    }

    return {
      options: [
        { value: CUSTOM_VALUE, label: currentValue, hint: "Serbest giriş" },
        ...catalogOptions,
      ],
      selectedValue: CUSTOM_VALUE,
    };
  }, [currentValue, products]);

  return (
    <Combobox
      className={className}
      options={options}
      value={selectedValue}
      disabled={disabled}
      onChange={(productId) => {
        if (productId === CUSTOM_VALUE) return;
        const product = products.find((item) => item.id === productId);
        if (product) void onValueChange(machineLabel(product));
      }}
      onCreate={(label) => void onValueChange(label)}
      placeholder="Makine seçin veya adını yazın…"
      searchPlaceholder="Marka, model veya ürün kodu ara…"
      emptyText="Katalogda eşleşen makine yok."
      createLabel={(query) => `“${query}” metnini istenen makine olarak kullan`}
    />
  );
}
