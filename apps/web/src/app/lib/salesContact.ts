import type { Contact, Customer, SalesCase } from "./mock";

export const normalizeWhatsAppNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return `90${digits.slice(1)}`;
  if (digits.length === 10) return `90${digits}`;
  return digits;
};

export function resolveSalesContact({
  salesCase,
  customer,
  contacts,
}: {
  salesCase: SalesCase;
  customer?: Customer;
  contacts: Contact[];
}) {
  const companyContacts = contacts.filter(
    (contact) => contact.customerId === salesCase.customerId || contact.companyIds?.includes(salesCase.customerId),
  );
  const primaryContact =
    companyContacts.find((contact) => contact.id === salesCase.primaryContactId) ??
    companyContacts.find((contact) => contact.isPrimary) ??
    companyContacts[0];
  const phone =
    primaryContact?.mobilePhone ||
    primaryContact?.phone ||
    primaryContact?.otherPhone ||
    salesCase.leadPhone ||
    customer?.phone ||
    customer?.phone2 ||
    "";
  const email =
    primaryContact?.email ||
    primaryContact?.personalEmail ||
    primaryContact?.otherEmail ||
    salesCase.leadEmail ||
    customer?.email ||
    customer?.email2 ||
    "";

  return {
    companyContacts,
    primaryContact,
    name: primaryContact?.name || salesCase.leadContactName || customer?.contactPerson || "İlgili kişi belirlenmedi",
    phone,
    email,
    whatsappNumber: normalizeWhatsAppNumber(phone),
  };
}
