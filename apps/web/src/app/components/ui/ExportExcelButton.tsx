import { useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './button';
import { useAuth } from '../../../lib/auth';
import { downloadExport, downloadExportPost } from '../../../lib/downloadExport';

type ExportExcelButtonProps = {
  path: string;
  filename: string;
  params?: Record<string, string | number | undefined | null>;
  body?: unknown;
  label?: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
  disabled?: boolean;
  /** Ucun `reports.export` DIŞINDA istediği izinler; eksikse buton hiç çizilmez. */
  requires?: string[];
};

/** `reports.export` izni olan kullanıcılara backend .xlsx indirme butonu gösterir. */
export function ExportExcelButton({
  path,
  filename,
  params,
  body,
  label = 'Excel İndir',
  className,
  size = 'sm',
  variant = 'outline',
  disabled,
  requires,
}: ExportExcelButtonProps) {
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!hasPermission('reports.export')) return null;
  if (requires?.some((permission) => !hasPermission(permission))) return null;

  const onClick = async () => {
    try {
      setLoading(true);
      if (body !== undefined) await downloadExportPost(path, filename, body);
      else await downloadExport(path, filename, params);
    } catch (e: any) {
      toast.error('Excel indirilemedi', { description: e?.message ?? 'Bilinmeyen hata' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={variant} size={size} className={className} onClick={onClick} disabled={disabled || loading}>
      <Download className="size-4" />
      {loading ? 'İndiriliyor…' : label}
    </Button>
  );
}
