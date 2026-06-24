import type { ServiceQuoteForm } from "./mock";

export const serviceQuoteMissingFields = (quote?: ServiceQuoteForm | null): string[] => {
  if (!quote) return ["servis teklif formu"];

  const missing: string[] = [];
  if (!quote.quoteNo.trim()) missing.push("teklif no");
  if (!quote.date.trim()) missing.push("tarih");
  if (!quote.validity.trim()) missing.push("geçerlilik süresi");
  if (!quote.writerName.trim()) missing.push("teklifi yazan");
  if (!quote.company.trim()) missing.push("firma");
  if (!quote.subject.trim()) missing.push("teklif kapsamı");
  if (!quote.currency) missing.push("para birimi");

  const enteredItems = quote.items.filter((item) => item.description.trim());
  const validItems = enteredItems.filter(
    (item) =>
      item.description.trim() &&
      item.unit.trim() &&
      Number.isFinite(item.quantity) &&
      item.quantity > 0 &&
      Number.isFinite(item.unitPrice) &&
      item.unitPrice >= 0,
  );
  if (!validItems.length) missing.push("en az bir ürün/hizmet kalemi");
  else if (validItems.length !== enteredItems.length) missing.push("eksik ürün/hizmet kalemi");
  return missing;
};

export const isServiceQuoteComplete = (quote?: ServiceQuoteForm | null): quote is ServiceQuoteForm =>
  serviceQuoteMissingFields(quote).length === 0;
