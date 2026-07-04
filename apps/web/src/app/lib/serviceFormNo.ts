import type { Delivery } from "./mock";

type ServiceFormNoContext = {
  currentFormNo?: string | null;
  relatedFormNo?: string | null;
  salesCaseId?: string | null;
  machineId?: string | null;
  fallbackId?: string | null;
};

const clean = (value?: string | null) => (value ?? "").trim();

export const suggestedServiceFormNo = ({ salesCaseId, machineId, fallbackId }: ServiceFormNoContext) => {
  const seed = clean(salesCaseId) || clean(machineId) || clean(fallbackId);
  if (!seed) return "";
  return `DR-${seed.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}`;
};

export const resolveServiceFormNo = (context: ServiceFormNoContext) =>
  clean(context.currentFormNo) ||
  clean(context.relatedFormNo) ||
  suggestedServiceFormNo(context);

export const relatedDeliveryFormNo = (
  deliveries: Delivery[],
  context: Pick<ServiceFormNoContext, "salesCaseId" | "machineId">,
) => {
  const salesCaseId = clean(context.salesCaseId);
  const machineId = clean(context.machineId);
  if (!salesCaseId && !machineId) return "";
  const match = deliveries.find((delivery) => {
    if (!delivery.formData?.formNo) return false;
    if (salesCaseId && delivery.salesCaseId === salesCaseId) return true;
    if (machineId && delivery.formData.machineId === machineId) return true;
    return false;
  });
  return clean(match?.formData?.formNo);
};
