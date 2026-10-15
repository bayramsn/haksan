import { useEffect, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { mailService } from "../../../../lib/services";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { SettingsSection } from "./settings-controls";

type SignatureUser = { id: string; name: string; email: string; hasMailAccount: boolean };
type Signature = { image: string | null; filename: string | null };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Lütfen tekrar deneyin.";
}

export function AdminMailSignatureSettings() {
  const [users, setUsers] = useState<SignatureUser[]>([]);
  const [userId, setUserId] = useState("");
  const [signature, setSignature] = useState<Signature | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [signatureLoading, setSignatureLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const [signatureError, setSignatureError] = useState(false);
  const [usersRetry, setUsersRetry] = useState(0);
  const [signatureRetry, setSignatureRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setUsersLoading(true);
    setUsersError(false);
    mailService.signatureUsers()
      .then((next) => { if (!cancelled) setUsers(next); })
      .catch((error: unknown) => {
        if (cancelled) return;
        setUsersError(true);
        toast.error("Kullanıcılar alınamadı", { description: errorMessage(error) });
      })
      .finally(() => { if (!cancelled) setUsersLoading(false); });
    return () => { cancelled = true; };
  }, [usersRetry]);

  useEffect(() => {
    let cancelled = false;
    setSignature(null);
    setSignatureError(false);
    if (!userId) return;
    setSignatureLoading(true);
    mailService.userSignature(userId)
      .then((next) => { if (!cancelled) setSignature(next); })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSignatureError(true);
        toast.error("Kullanıcının imzası alınamadı", { description: errorMessage(error) });
      })
      .finally(() => { if (!cancelled) setSignatureLoading(false); });
    return () => { cancelled = true; };
  }, [userId, signatureRetry]);

  const saveSignature = async (file: File | null) => {
    if (!userId || !signature || saving) return;
    if (file && (!/\.(png|jpe?g|webp)$/i.test(file.name)
      || !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      || !file.size || file.size > 2 * 1024 * 1024)) {
      toast.error("PNG, JPG veya WEBP seçin; imza görseli en fazla 2 MB olabilir.");
      return;
    }
    setSaving(true);
    try {
      const image = file ? await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string"
          ? resolve(reader.result) : reject(new Error("Görsel okunamadı"));
        reader.onerror = () => reject(new Error("Görsel okunamadı"));
        reader.readAsDataURL(file);
      }) : null;
      setSignature(await mailService.saveUserSignature(userId, { image, filename: file?.name ?? null }));
      toast.success(file ? "Kullanıcının mail imzası kaydedildi" : "Kullanıcının mail imzası kaldırıldı");
    } catch (error: unknown) {
      toast.error("Mail imzası kaydedilemedi", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = users.find((user) => user.id === userId);

  return (
    <SettingsSection icon={<ImagePlus />} title="Kullanıcıların mail imzaları"
      description="Süper admin olarak kullanıcılar için görsel imza yükleyebilir veya mevcut imzalarını kaldırabilirsiniz.">
      <div className="space-y-4">
        <div>
          <Label htmlFor="admin-signature-user" className="text-xs text-muted-foreground">Kullanıcı</Label>
          <Select value={userId} disabled={usersLoading || saving || users.length === 0}
            onValueChange={(value) => { setSignature(null); setUserId(value); }}>
            <SelectTrigger id="admin-signature-user" className="mt-1">
              <SelectValue placeholder={usersLoading ? "Kullanıcılar yükleniyor…" : "Kullanıcı seçin"} />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => <SelectItem key={user.id} value={user.id}>{user.name} · {user.email}</SelectItem>)}
            </SelectContent>
          </Select>
          {usersError && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setUsersRetry((value) => value + 1)}>Kullanıcıları yeniden yükle</Button>}
          {!usersLoading && !usersError && users.length === 0 && <p className="mt-2 text-xs text-muted-foreground">İmza atanabilecek kullanıcı bulunamadı.</p>}
        </div>
        {selectedUser && (
          <div className="space-y-3">
            {!selectedUser.hasMailAccount && <p className="text-xs text-muted-foreground">Bu kullanıcının webmail hesabı henüz bağlı değil. İmzasını şimdi yükleyebilirsiniz; hesabını bağladığında gönderdiği maillere otomatik eklenir.</p>}
            {signatureLoading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />İmza yükleniyor…</p>}
            {signatureError && <Button type="button" variant="outline" size="sm" onClick={() => setSignatureRetry((value) => value + 1)}>İmzayı yeniden yükle</Button>}
            {signature && (
              <>
                {signature.image ? <div>
                  <img src={signature.image} alt={`${selectedUser.name} mail imzası`} className="h-auto w-[480px] max-w-full rounded border bg-white" />
                  {signature.filename && <p className="mt-1 break-all text-xs text-muted-foreground">{signature.filename}</p>}
                </div> : <p className="text-xs text-muted-foreground">Bu kullanıcı için kayıtlı görsel imza yok.</p>}
                <div>
                  <Label htmlFor="admin-mail-signature" className="text-xs">İmza görseli</Label>
                  <Input id="admin-mail-signature" type="file" accept=".png,.jpg,.jpeg,.webp" className="mt-2" disabled={saving || signatureLoading}
                    onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void saveSignature(file); }} />
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG veya WEBP · en fazla 2 MB. Görsel seçildiğinde kaydedilir.</p>
                </div>
                {signature.image && <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => void saveSignature(null)}>İmzayı kaldır</Button>}
              </>
            )}
            {saving && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" />İmza kaydediliyor…</p>}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
