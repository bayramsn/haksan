import { shareServerPdf, type ServerPdfKind } from '@/src/api/server-pdf';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { downloadAndShareFile, getPdfAndShare, postPdfAndShare } from '@/src/native/files';
import { Button } from '@/src/ui';
import { toast } from '@/src/ui/toast';

/**
 * Kayıtlı PDF varsa sunucudan indirilir. Yeni çıktılar sunucuda üretilir.
 */
export function CrmDocumentShare({
  fileId,
  pdfPath,
  pdfMethod = 'GET',
  filename,
  label = "CRM'den PDF indir",
  render,
}: {
  fileId?: string | null;
  pdfPath?: string | null;
  pdfMethod?: 'GET' | 'POST';
  filename: string;
  label?: string;
  render?: { kind: ServerPdfKind; html: () => string };
}) {
  const [busy, setBusy] = useState(false);
  const canShare = Boolean(fileId || pdfPath || render);

  const share = async () => {
    if (!canShare || busy) return;
    setBusy(true);
    try {
      if (fileId) await downloadAndShareFile(fileId);
      else if (pdfPath) {
        if (pdfMethod === 'POST') await postPdfAndShare(pdfPath, filename);
        else await getPdfAndShare(pdfPath, filename);
      } else if (render) await shareServerPdf(render.kind, render.html(), filename);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Belge indirilemedi.');
    } finally {
      setBusy(false);
    }
  };

  if (!canShare) {
    return (
      <Text className="font-inter text-xs leading-5 text-muted-foreground">
        Bu kayıt için sunucuda paylaşılabilir bir belge bulunamadı.
      </Text>
    );
  }

  return (
    <Button label={label} onPress={() => void share()} loading={busy} trailingIcon="download-outline" />
  );
}

/** @deprecated Yerel PNG üretimi kaldırıldı; CrmDocumentShare kullanın. */
export function DocumentCapture({
  title: _title,
  fileName,
  children,
  fileId,
  pdfPath,
  pdfMethod,
}: {
  title: string;
  fileName: string;
  children: ReactNode;
  fileId?: string | null;
  pdfPath?: string | null;
  pdfMethod?: 'GET' | 'POST';
}) {
  return (
    <View className="gap-3">
      <View className="rounded-surface border border-border bg-card p-4">{children}</View>
      <CrmDocumentShare fileId={fileId} pdfPath={pdfPath} pdfMethod={pdfMethod} filename={fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`} />
    </View>
  );
}

/** Belge içindeki etiket/değer satırı. */
export function DocRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View className="flex-row gap-3 border-b border-border py-1.5">
      <Text className="w-[38%] font-inter text-[12px] text-muted-foreground">{label}</Text>
      <Text className="flex-1 font-inter-medium text-[12px] text-foreground">{value || '—'}</Text>
    </View>
  );
}

export function DocTitle({ children }: { children: ReactNode }) {
  return <Text className="pb-1 pt-3 font-inter-semibold text-[15px] text-foreground">{children}</Text>;
}
