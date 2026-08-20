import { useState } from "react";
import { ChevronRight, Download, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { fileService } from "../../../lib/services";
import { useStore } from "../../lib/store";
import type { DocumentItem, SalesCase } from "../../lib/mock";
import { DocumentDetailDialog } from "../dialogs/DocumentDetailDialog";
import { SignedContractUploadDialog } from "../dialogs/ContractActionsDialogs";
import { Button } from "../ui/button";

export const sortOpportunityContracts = (contracts: DocumentItem[]) =>
  contracts.slice().sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));

/**
 * Fırsata bağlı sözleşmeler — teklif listesinin sözleşme karşılığı.
 *
 * Süreç adımında yalnız "Sözleşme oluşturuldu" tiki görünüyordu; sözleşmenin
 * kendisi ve imzalı nüshası çalışma alanının başka bir kutusundaydı. Liste,
 * tekliflerde olduğu gibi adımın altında durur: sözleşme buradan açılır,
 * imzalı PDF buradan bağlanır (yükleme işini `SignedContractUploadDialog`
 * yapar; imza tarihi ve durum kodu orada tek yerde yönetilir).
 */
export function OpportunityContractList({
  salesCase,
  canUpload = true,
}: {
  salesCase: SalesCase;
  canUpload?: boolean;
}) {
  const { documents } = useStore();
  const [openDoc, setOpenDoc] = useState<DocumentItem | null>(null);

  const contracts = sortOpportunityContracts(
    documents.filter((item) => item.type === "Contract" && item.salesCaseId === salesCase.id),
  );

  if (contracts.length === 0) return null;

  const download = async (item: DocumentItem) => {
    if (!item.fileId) return;
    try {
      const signed = await fileService.signedDownload(item.fileId);
      const anchor = document.createElement("a");
      anchor.href = signed.downloadUrl;
      anchor.download = signed.filename || `${item.fileName}.pdf`;
      anchor.click();
    } catch (error: unknown) {
      toast.error("İmzalı sözleşme indirilemedi", {
        description: error instanceof Error ? error.message : "İstek başarısız oldu.",
      });
    }
  };

  return (
    <div className="border-t border-border/60 bg-muted/15 px-3 py-2.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Fırsata bağlı sözleşmeler · {contracts.length}
        </span>
        <span className="text-[10px] text-muted-foreground">İmzalı nüshayı buraya yükleyin</span>
      </div>
      <ul aria-label="Fırsata bağlı sözleşmeler" className="grid gap-1.5">
        {contracts.map((item) => (
          <li key={item.id}>
            <div className="grid min-h-12 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/70 bg-background px-2.5 py-2 shadow-xs">
              <span className="grid size-8 place-items-center rounded-md bg-primary/8 text-primary" aria-hidden="true">
                <FileSignature className="size-4" />
              </span>
              <button
                type="button"
                aria-label={`${item.fileName} sözleşmesini görüntüle`}
                onClick={() => setOpenDoc(item)}
                className="group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                  <span className="truncate text-xs font-semibold text-foreground">{item.fileName}</span>
                  <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </span>
                <span className="mt-0.5 block text-[10px] tabular-nums text-muted-foreground">
                  {item.uploadedAt || "—"} ·{" "}
                  <b className={`font-semibold ${item.fileId ? "text-success" : "text-warning"}`}>
                    {item.fileId ? "İmzalı nüsha bağlı" : "İmzalı nüsha bekleniyor"}
                  </b>
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {item.fileId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    title="İmzalı sözleşmeyi indir"
                    aria-label={`${item.fileName} imzalı sözleşmesini indir`}
                    onClick={() => void download(item)}
                  >
                    <Download className="size-4" />
                  </Button>
                )}
                {canUpload && (
                  <SignedContractUploadDialog
                    document={item}
                    salesCase={salesCase}
                    trigger={
                      <Button type="button" variant="outline" size="sm" className="h-8 text-[11px]">
                        {item.fileId ? "İmzalıyı değiştir" : "İmzalı PDF yükle"}
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <DocumentDetailDialog doc={openDoc} onClose={() => setOpenDoc(null)} />
    </div>
  );
}
