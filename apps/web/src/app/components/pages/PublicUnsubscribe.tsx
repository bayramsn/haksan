import { useState } from "react";
import { CheckCircle2, Loader2, MailX } from "lucide-react";
import { publicMailService } from "../../../lib/services";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

/** Toplu maildeki "abonelikten çık" bağlantısının sayfası. Tek GET kimseyi çıkarmaz; onay düğmesi POST eder. */
export function PublicUnsubscribePage({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [email, setEmail] = useState("");
  const confirm = async () => {
    setState("busy");
    try {
      setEmail((await publicMailService.unsubscribe(token)).email);
      setState("done");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {state === "done" ? <CheckCircle2 className="size-5 text-success" /> : <MailX className="size-5" />}
            {state === "done" ? "Listeden çıkarıldınız" : "Toplu e-postalardan çık"}
          </CardTitle>
          <CardDescription>
            {state === "done"
              ? `${email} adresine bundan sonra toplu duyuru ve katalog e-postası gönderilmeyecek.`
              : "Onaylarsanız bu adrese toplu duyuru ve katalog e-postaları gönderilmez. Satış temsilcinizle bire bir yazışmalarınız etkilenmez."}
          </CardDescription>
        </CardHeader>
        {state !== "done" && (
          <CardContent className="space-y-3">
            {state === "error" && <p className="text-sm text-destructive">Bağlantı geçersiz veya süresi dolmuş. Lütfen e-postayı yanıtlayarak bize bildirin.</p>}
            <Button className="w-full gap-2" disabled={state === "busy"} onClick={() => void confirm()}>
              {state === "busy" && <Loader2 className="size-4 animate-spin" />}Abonelikten çık
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
