import { resolveMediaUrl } from "../../../lib/apiClient";
import { printSignatureFromSnapshot as fromSnapshot, printSignatureFromDocumentSnapshot as fromDocument } from "./signatureData";

export const printSignatureFromSnapshot = (snapshot: unknown) => fromSnapshot(snapshot, resolveMediaUrl);
export const printSignatureFromDocumentSnapshot = (snapshot: unknown) => fromDocument(snapshot, resolveMediaUrl);
