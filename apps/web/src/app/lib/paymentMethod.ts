import type { OpportunityPaymentMethod } from "./mock";

/**
 * Ödeme yöntemi ailesi — kullanıcının gördüğü üst seçim.
 *
 * `OpportunityPaymentMethod` sekiz düz değer taşıyor ama satışçının kafasındaki
 * ayrım daha kaba: peşin mi, vadeli mi, leasing mi. Senet ve çek ayrı yöntem
 * değil, VADENİN TÜRÜ. Bu yüzden üst seçim aile üzerinden yapılır, alt tür
 * yalnız "vadeli" seçilince sorulur ve saklanan değere eşlenir — böylece
 * mevcut enum ve backend kuralları değişmeden kalır (migration gerekmez).
 */
export type PaymentFamily = "cash" | "wire_transfer" | "term" | "installment" | "leasing" | "letter_of_credit";

export const PAYMENT_FAMILY_LABELS: Record<PaymentFamily, string> = {
  cash: "Peşin",
  leasing: "Leasing",
  term: "Vadeli",
  wire_transfer: "Havale",
  installment: "Taksitli",
  letter_of_credit: "Akreditif",
};

/**
 * Satışın seçebileceği aileler. Havale, taksitli ve akreditif eski kayıtlardan
 * gelir; yeni kartlarda seçilmez ama kayıt bunlardan birini taşıyorsa listeye
 * eklenir — aksi hâlde kart açıldığında seçim sessizce başka bir değere kayardı.
 */
export const PAYMENT_FAMILY_OPTIONS: PaymentFamily[] = ["cash", "leasing", "term"];

export const paymentFamilyOptions = (current: PaymentFamily | null): PaymentFamily[] =>
  current && !PAYMENT_FAMILY_OPTIONS.includes(current)
    ? [...PAYMENT_FAMILY_OPTIONS, current]
    : PAYMENT_FAMILY_OPTIONS;

/** Vade türü → saklanan ödeme yöntemi. "Elden" ayrı bir enum değeri gerektirmiyor. */
export const TERM_KIND_TO_METHOD = {
  elden: "term",
  senet: "promissory_note",
  cek: "cheque",
} as const satisfies Record<string, OpportunityPaymentMethod>;

export type TermKind = keyof typeof TERM_KIND_TO_METHOD;

/** Her vade satırında senet/çek için kaydedilen belge ayrıntıları. */
export type PaymentInstrumentDetails = {
  documentNo: string;
  issuer: string;
  bankName: string;
  branchName: string;
};

export type PaymentPlanInstallment = PaymentInstrumentDetails & {
  amount: number;
  dueDate: string;
};

export const EMPTY_PAYMENT_INSTRUMENT_DETAILS: PaymentInstrumentDetails = {
  documentNo: "",
  issuer: "",
  bankName: "",
  branchName: "",
};

/** Yeniden hesaplanan tutar/tarihi uygular, girilmiş senet/çek bilgisini korur. */
export const recalculatePaymentInstallment = (
  previous: PaymentPlanInstallment | undefined,
  amount: number,
  dueDate: string,
): PaymentPlanInstallment => ({
  ...EMPTY_PAYMENT_INSTRUMENT_DETAILS,
  ...previous,
  amount,
  dueDate,
});

export const TERM_KIND_LABELS: Record<TermKind, string> = {
  elden: "Elden",
  senet: "Senet",
  cek: "Çek",
};

/** Saklanan yöntemden aileyi ve vade türünü geri okur (düzenleme modu için). */
export const familyOfMethod = (method: OpportunityPaymentMethod): PaymentFamily | null => {
  if (method === "promissory_note" || method === "cheque" || method === "term") return "term";
  if (method === "undecided") return null;
  return method as PaymentFamily;
};

export const termKindOfMethod = (method: OpportunityPaymentMethod): TermKind =>
  method === "promissory_note" ? "senet" : method === "cheque" ? "cek" : "elden";

/** Senet ve çekte işin gerçekten takip edilebilmesi için zorunlu alanlar. */
export const missingPaymentInstrumentFields = (
  method: OpportunityPaymentMethod,
  details: PaymentInstrumentDetails,
): string[] => {
  if (method === "promissory_note") {
    return [
      !details.documentNo.trim() ? "senet numarası" : "",
      !details.issuer.trim() ? "borçlu" : "",
    ].filter(Boolean);
  }
  if (method === "cheque") {
    return [
      !details.documentNo.trim() ? "çek numarası" : "",
      !details.bankName.trim() ? "banka" : "",
      !details.issuer.trim() ? "hesap sahibi" : "",
    ].filter(Boolean);
  }
  return [];
};

/** Cari hareket notunda okunabilir ve aranabilir belge özeti. */
export const paymentInstrumentNote = (
  method: OpportunityPaymentMethod,
  details: PaymentInstrumentDetails,
): string => {
  if (method === "promissory_note") {
    return `Senet No: ${details.documentNo.trim()} · Borçlu: ${details.issuer.trim()}`;
  }
  if (method === "cheque") {
    return [
      `Çek No: ${details.documentNo.trim()}`,
      `Banka: ${details.bankName.trim()}`,
      details.branchName.trim() ? `Şube: ${details.branchName.trim()}` : "",
      `Hesap Sahibi: ${details.issuer.trim()}`,
    ].filter(Boolean).join(" · ");
  }
  return "";
};

/** Aile + vade türünden saklanacak yöntem kodu. */
export const methodOfFamily = (
  family: PaymentFamily | null,
  termKind: TermKind
): OpportunityPaymentMethod => (family === "term" ? TERM_KIND_TO_METHOD[termKind] : (family ?? "undecided"));

/**
 * Ailenin plan şekli.
 *
 * Peşin ve leasingde ödeme planı ADIMI TAMAMEN ATLANIR: peşinde tahsilat tek
 * seferde ve anında, leasingde taksitleri finans kuruluşu takip eder — CRM'de
 * vade satırı üretmek gerçeğe karşılık gelmeyen alacak kayıtları doğuruyordu.
 */
export const PAYMENT_FAMILY_PLAN_SHAPE: Record<PaymentFamily, "schedule" | "single" | "none"> = {
  cash: "none",
  leasing: "none",
  term: "schedule",
  installment: "schedule",
  wire_transfer: "single",
  letter_of_credit: "single",
};

/** Tek ödemeli yöntemlerde vade alanının anlamı yönteme göre değişir. */
export const PAYMENT_DUE_LABEL: Partial<Record<OpportunityPaymentMethod, string>> = {
  cash: "Ödeme günü (0 = hemen)",
  wire_transfer: "Transfer günü",
  term: "Vade (gün)",
  leasing: "Peşinat ödeme günü",
  letter_of_credit: "Akreditif vadesi (gün)",
};
