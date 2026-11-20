import { Button } from "../ui/button";

export function WorkspaceRecordUnavailable({ onClose }: { onClose: () => void }) {
  return (
    <section className="rounded-xl border bg-card p-6 text-center" role="status">
      <h2 className="text-lg font-semibold">Kayıt açılamadı</h2>
      <p className="mt-2 text-sm text-muted-foreground">Kayıt bulunamadı veya bu kayda erişiminiz yok.</p>
      <Button variant="outline" className="mt-4" onClick={onClose}>Geri dön</Button>
    </section>
  );
}
