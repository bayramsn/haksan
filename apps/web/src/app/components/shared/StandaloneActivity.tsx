import { Eye, FileText, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { CreateCaseDialog } from "../dialogs/CreateDialogs";
import type { Activity } from "../../lib/mock";
import { useAuth } from "../../../lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

/** Fırsata bağlı olmayan aktivite mi? */
export const isStandaloneActivity = (activity: Activity) => !activity.salesCaseId;

export const canViewStandaloneActivities = (roles: string[] | undefined) =>
  Boolean(roles?.some((role) => ['sales', 'service', 'admin', 'super_admin'].includes(role)));

/** Aktivite listelerinde fırsat dışı kayıtları ayırt eden etiket. */
export function NonOpportunityBadge() {
  return <span className="chip chip-warning">Fırsat Dışı Aktivite</span>;
}

const activityDetailText = (activity: Activity) => {
  const note = isStandaloneActivity(activity)
    ? activity.note
        .split("\n")
        .filter((line) => !/^\s*Konum\s*:/i.test(line))
        .join("\n")
        .trim()
    : activity.note.trim();
  return { note, result: activity.result?.trim() ?? "" };
};

/** Tüm aktivite akışlarında aynı, tam metinli salt-okunur ayrıntı penceresi. */
export function ActivityDetailDialog({
  activity,
  trigger,
  showConvert = true,
}: {
  activity: Activity;
  trigger?: ReactNode;
  showConvert?: boolean;
}) {
  const { note, result } = activityDetailText(activity);
  const files = Array.isArray(activity.files) ? activity.files : [];

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="icon" className="size-8" title="Aktivite ayrıntısını oku">
            <Eye className="size-4" />
            <span className="sr-only">{activity.title} aktivitesinin ayrıntısını oku</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <DialogTitle className="min-w-0 break-words">{activity.title || "Aktivite"}</DialogTitle>
            {isStandaloneActivity(activity) && <NonOpportunityBadge />}
          </div>
          <DialogDescription>
            {[activity.type || "Aktivite", activity.date || "Tarih yok", activity.createdByName || "Kaydeden bilinmiyor"]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <section className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Not / Ayrıntı</div>
            <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
              {note || "Ayrıntı girilmemiş."}
            </div>
          </section>
          <section className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sonuç</div>
            <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
              {result || "Sonuç girilmemiş."}
            </div>
          </section>
          {files.length > 0 && (
            <section className="rounded-lg border border-border/70 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dosyalar</div>
              <ul className="mt-1.5 space-y-1 text-sm">
                {files.map((file: any, index) => (
                  <li key={file?.id ?? `${file?.fileName ?? "dosya"}-${index}`} className="flex min-w-0 items-center gap-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{file?.fileName ?? file?.filename ?? file?.name ?? `Dosya ${index + 1}`}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {showConvert && isStandaloneActivity(activity) && (
          <DialogFooter className="sm:justify-start">
            <ConvertActivityToOpportunity activity={activity} />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Fırsat dışı bir aktiviteyi satış fırsatına dönüştürür: yeni fırsat firmadan
 * ve aktivite metninden ön doldurulur, kayıt açıldıktan sonra aktivite yeni
 * fırsata bağlanır — böylece temas geçmişi kopmaz ve aktivite artık fırsat
 * dışı listesinde görünmez.
 */
export function ConvertActivityToOpportunity({
  activity,
  size = "sm",
}: {
  activity: Activity;
  size?: "sm" | "icon";
}) {
  const { hasPermission, user } = useAuth();
  if (!isStandaloneActivity(activity)) return null;
  if (!canViewStandaloneActivities(user?.roles)) return null;
  if (!hasPermission("activities.convert")) return null;

  const description = [activity.title, activity.note, activity.result]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n");

  return (
    <CreateCaseDialog
      defaultCustomerId={activity.customerId}
      defaultDescription={description}
      sourceActivityId={activity.id}
      onCreated={() => {
        toast.success("Aktivite fırsata dönüştürüldü", {
          description: `${activity.title} ve geçmişi yeni fırsata aktarıldı.`,
        });
      }}
      trigger={
        size === "icon" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title="Fırsata dönüştür"
            aria-label={`${activity.title} fırsata dönüştür`}
          >
            <Sparkles className="size-4" />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 bg-white text-xs">
            <Sparkles className="size-3.5" /> Fırsata Dönüştür
          </Button>
        )
      }
    />
  );
}
