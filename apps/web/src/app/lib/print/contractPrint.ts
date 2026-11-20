import { resolveMediaUrl } from "../../../lib/apiClient";
// Keep network loading in the web adapter; PDF data assembly also runs on mobile.
import { quoteService } from "../../../lib/services";
import { buildContractData, type ContractBuildInput } from "./contractData";
export { assertContractReady, contractReadinessErrors, contractTermsFillContext } from "./contractData";
export type { ContractBuildInput } from "./contractData";

export async function loadContractPrintData(input: ContractBuildInput) {
  if (!input.documentSnapshot && !input.offer) throw new Error("Sözleşme için ilişkili teklif bulunamadı.");
  const quote = input.documentSnapshot ? undefined : await quoteService.get(input.offer!.id);
  return buildContractData({ ...input, resolveMediaUrl }, quote);
}
