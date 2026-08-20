import {
  PAYMENT_FAMILY_LABELS,
  TERM_KIND_LABELS,
  familyOfMethod,
  methodOfFamily,
  paymentFamilyOptions,
  termKindOfMethod,
  type PaymentFamily,
  type TermKind,
} from "../../lib/paymentMethod";
import type { OpportunityPaymentMethod } from "../../lib/mock";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

/**
 * İki kademeli ödeme biçimi seçimi: önce aile (Peşin / Leasing / Vadeli),
 * vadeli seçildiyse vade türü (Elden / Senet / Çek). Tek düz liste "senet" ile
 * "vadeli"yi aynı düzeyde gösterdiği için ödemenin vadeli olup olmadığını
 * kartta okunmaz hâle getiriyordu.
 *
 * Seçim tek bir `paymentMethod` değerine eşlenir; ayrı bir vade türü alanı
 * tutulmaz (bkz. lib/paymentMethod.ts).
 */
export function PaymentMethodSelect({
  value,
  onChange,
  disabled,
  idPrefix = "payment-method",
  className = "",
  size,
  labels = true,
}: {
  value: OpportunityPaymentMethod | null | undefined;
  onChange: (method: OpportunityPaymentMethod) => void;
  disabled?: boolean;
  idPrefix?: string;
  className?: string;
  size?: "sm";
  labels?: boolean;
}) {
  const method = value ?? "undecided";
  const family = familyOfMethod(method);
  const termKind = termKindOfMethod(method);
  const triggerClass = size === "sm" ? "h-8 w-full bg-white text-xs" : "w-full";

  return (
    <div className={`grid gap-2 ${family === "term" ? "sm:grid-cols-2" : ""} ${className}`}>
      <div className="space-y-1.5">
        {labels && <Label className="text-xs" htmlFor={`${idPrefix}-family`}>Ödeme Şekli *</Label>}
        <Select
          value={family ?? ""}
          disabled={disabled}
          onValueChange={(next) => onChange(methodOfFamily(next as PaymentFamily, termKind))}
        >
          <SelectTrigger id={`${idPrefix}-family`} size={size} className={triggerClass}>
            <SelectValue placeholder="Ödeme şekli seçin" />
          </SelectTrigger>
          <SelectContent>
            {paymentFamilyOptions(family).map((code) => (
              <SelectItem key={code} value={code}>
                {PAYMENT_FAMILY_LABELS[code]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Senet ve çek ayrı yöntem değil, vadenin türü. */}
      {family === "term" && (
        <div className="space-y-1.5">
          {labels && <Label className="text-xs" htmlFor={`${idPrefix}-term-kind`}>Vade Türü *</Label>}
          <Select
            value={termKind}
            disabled={disabled}
            onValueChange={(next) => onChange(methodOfFamily("term", next as TermKind))}
          >
            <SelectTrigger id={`${idPrefix}-term-kind`} size={size} className={triggerClass}>
              <SelectValue placeholder="Vade türü seçin" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TERM_KIND_LABELS) as TermKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {TERM_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
