import { useEffect, useState } from "react";

type ReadyState = "checking" | "ok" | "degraded";

/** API şema/migration durumu — aynı-origin /health/ready (nginx proxy). */
export function ReadinessBanner() {
  const [state, setState] = useState<ReadyState>("checking");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/health/ready", { credentials: "omit" });
        if (cancelled) return;
        if (res.ok) {
          setState("ok");
          return;
        }
        const body = await res.json().catch(() => ({}));
        setReason(typeof body?.reason === "string" ? body.reason : `HTTP ${res.status}`);
        setState("degraded");
      } catch {
        if (!cancelled) setState("ok");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state !== "degraded") return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-900 dark:text-amber-100"
    >
      Sistem kısmen kullanılamıyor
      {reason ? ` (${reason})` : ""}. Yöneticiniz migration veya veritabanı bakımı yapıyor olabilir.
    </div>
  );
}
