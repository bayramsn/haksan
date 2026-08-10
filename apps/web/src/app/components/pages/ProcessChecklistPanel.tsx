import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Circle, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { type OpportunityProcessActionKey, type ProcessCheck } from "@haksan/shared";
import { activityService } from "../../../lib/services";
import { useAuth } from "../../../lib/auth";
import { useStore } from "../../lib/store";
import {
  salesStageLabel,
  type Customer,
  type OpportunityPaymentMethod,
  type QualificationStage,
  type SalesCase,
} from "../../lib/mock";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { CreateContactDialog } from "../dialogs/CreateDialogs";
import { RequestedMachineCombobox } from "../shared/RequestedMachineCombobox";
import { PaymentMethodSelect } from "../shared/PaymentMethodSelect";
import { RemoteContactCombobox } from "../shared/RemoteContactCombobox";
import { OPPORTUNITY_OPERATION_GROUP_STEPS } from "./opportunityProcessGroups";
import { useCompanyDetail } from "../../lib/companyServerData";

/**
 * Ödeme planının ipucu metni seçilen ödeme şekline göre değişir: kullanıcı boş
 * kutuya ne yazacağını tahmin etmek zorunda kalmasın.
 */
const PAYMENT_TERMS_PLACEHOLDER: Partial<Record<OpportunityPaymentMethod, string>> = {
  cash: "Peşin: ödeme tarihi ve varsa peşin iskontosu",
  wire_transfer: "Havale: hesap, tutar ve transfer tarihi",
  promissory_note: "Senet: adet, vade tarihleri ve tutarlar",
  term: "Vadeli: vade gün sayısı ve son ödeme tarihi",
  installment: "Taksitli: taksit adedi, tutarı ve ilk taksit tarihi",
  leasing: "Leasing: finans kuruluşu, süre ve peşinat oranı",
  letter_of_credit: "Akreditif: banka, vade ve açılış koşulları",
  cheque: "Çek: adet, vade tarihleri ve keşideci",
};

const OPPORTUNITY_CHECK_BY_ACTION: Partial<Record<OpportunityProcessActionKey, string>> = {
  assign_owner: "owner",
  edit_subject: "subject",
  link_company: "company",
  edit_company: "location",
  link_contact: "contact",
  create_contact: "contact",
  record_call: "call",
  record_visit: "visit",
  edit_machine: "machine",
  edit_payment_method: "payment_method",
  edit_contract_terms: "contract_terms",
  edit_payment_terms: "payment_terms",
  approve_payment: "payment",
  approve_customs: "customs",
  approve_invoice: "invoice",
  approve_installation: "installation",
  approve_win: "win",
};

/** Store özetindeki eski check kayıtları actionKey taşımaz; backend tanımıyla aynı güvenli eşleme. */
const CHECK_ACTION_BY_KEY: Record<string, OpportunityProcessActionKey> = {
  owner: "assign_owner",
  subject: "edit_subject",
  company: "link_company",
  contact: "link_contact",
  location: "edit_company",
  address: "edit_company",
  email: "edit_company",
  sector: "edit_company",
  phone: "edit_company",
  call: "record_call",
  visit: "record_visit",
  machine: "edit_machine",
  payment_method: "edit_payment_method",
  quote: "create_quote",
  quote_approved: "approve_quote",
  proforma: "create_proforma",
  contract: "create_contract",
  contract_terms: "edit_contract_terms",
  payment_terms: "edit_payment_terms",
  payment_plan: "create_payment_plan",
  commercial_invoice: "create_commercial_invoice",
  commercial_invoice_file: "create_commercial_invoice",
  customs: "approve_customs",
  stock: "reserve_stock",
  shipment: "create_shipment",
  shipment_arrived: "complete_shipment",
  installation: "open_installation",
  installation_completed: "complete_installation",
  payment_approval: "approve_payment",
  invoice_approval: "approve_invoice",
  installation_approval: "approve_installation",
  win_approval: "approve_win",
};

type DisplayProcessCheck = Pick<ProcessCheck, "key" | "label" | "complete"> & {
  actionKey?: OpportunityProcessActionKey;
};

const INLINE_EDITOR_CHECK_KEYS = new Set([
  "subject",
  "owner",
  "company",
  "contact",
  "location",
  "address",
  "email",
  "phone",
  "sector",
  "call",
  "visit",
  "machine",
  "payment_method",
  "contract_terms",
  "payment_terms",
  "customs",
]);

const CHECK_ACTION_LABELS: Record<string, string> = {
  call: "Aramayı kaydet",
  visit: "Ziyareti kaydet",
  machine: "Makine seç",
  payment_method: "Ödeme şekli seç",
  quote: "Teklif oluştur",
  quote_approved: "Onayla",
  proforma: "Proforma oluştur",
  contract: "Sözleşme oluştur",
};

const DIALOG_ACTION_KEYS = new Set<OpportunityProcessActionKey>([
  "create_quote",
  "create_proforma",
  "create_contract",
  "create_payment_plan",
  "create_commercial_invoice",
  "reserve_stock",
  "create_shipment",
  "complete_shipment",
]);

/**
 * Kartın bulunduğu satış derecesini geçmek için tamamlanması gereken alanları
 * kompakt durum düğmeleriyle listeler; yalnız seçilen adımın düzenleyicisini
 * erişilebilir bir pencerede açar.
 * Kontrol listesi backend'in `processReadiness.checks` çıktısıdır; burada
 * yalnız her `key` için doğru düzenleyici eşlenir. Böylece UI, backend'in
 * gerçekten aradığı koşulun dışına çıkıp olmayan bir kural vaat etmez.
 *
 * Panel elementini üst bileşen yaratır (aksiyon isteği ve dialog'lar oranın
 * state'ine bağlı) ama render edildiği yer satış alanı kutusunun içidir: kutuya
 * prop olarak geçer. Böylece `requestedAction` bağı korunur, portal gerekmez.
 *
 * Gösterilen görevler ray'dan seçilen alana göre değişir (`checks` prop'u).
 * İleri alanlar `readOnly`: sırası gelmemiş görevi doldurmak sırayı atlamaktır.
 *
 * İlerletme düğmesi burada YOK — tek düğme kutunun altındadır; burada ikinci bir
 * ilerletme yolu olması hem kapalı kart hem sunucu engelleri kontrolünü atlayan
 * ikinci bir kapı açardı.
 */
export function ProcessChecklistPanel({
  sc,
  requestedAction,
  onActionHandled,
  onAction,
  canPerformAction,
  onSaved,
  checks: checksOverride,
  readOnly = false,
}: {
  sc: SalesCase;
  requestedAction?: OpportunityProcessActionKey | null;
  onActionHandled?: () => void;
  /** Kendi özel dialog/akışı olan ticari adımları üst bileşene yönlendirir. */
  onAction?: (actionKey: OpportunityProcessActionKey) => void;
  canPerformAction?: (actionKey: OpportunityProcessActionKey) => boolean;
  /**
   * Gösterilecek modern görev listesi. Verilmezse eski store özeti yalnız
   * geriye dönük uyumluluk için kullanılır.
   * Ray'dan başka bir alan seçildiğinde o alanın görevleri geçilir — kontroller
   * `processReadiness.checks` içinde `qualificationStage` ile etiketli geliyor.
   */
  checks?: ProcessCheck[];
  /** İleri alanların görevleri yalnız önizlemedir; düzenleme kapalıdır. */
  readOnly?: boolean;
  /**
   * Kaydetmeden sonra satış alanı kutusunun hazırlık verisini tazeler.
   *
   * Panel ve kutu aynı detay çağrısındaki `processReadiness` listesini kullanır;
   * store özeti yalnız eski ekranların geri dönüş kaynağıdır.
   */
  onSaved?: () => Promise<void> | void;
}) {
  const { users, products, updateCase, updateCustomer, decideCaseApproval, refresh } =
    useStore();
  const { hasRole, hasPermission } = useAuth();
  const isSuperAdmin = hasRole("super_admin");
  const canUpdate = hasPermission("opportunities.update");
  const canCreateActivity = hasPermission("activities.create");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [activeCheckKey, setActiveCheckKey] = useState<string | null>(null);
  const readiness = sc.qualificationReadiness;
  const companyQuery = useCompanyDetail(sc.customerId);
  const company = companyQuery.data;
  const grade = (sc.qualificationStage ?? "lead") as QualificationStage;
  const areaSteps = OPPORTUNITY_OPERATION_GROUP_STEPS[grade] ?? [];
  const availableChecks = checksOverride ?? readiness?.checks ?? [];
  useEffect(() => {
    if (!requestedAction) return;
    const key = OPPORTUNITY_CHECK_BY_ACTION[requestedAction];
    if (!key || !availableChecks.some((item) => item.key === key)) return;
    setActiveCheckKey(key);
    onActionHandled?.();
  }, [requestedAction, availableChecks, onActionHandled]);

  /** Bir görev düzenleyicisini tek-adım penceresinde açar. */
  const openCheck = (key: string) => {
    if (readOnly) return;
    setActiveCheckKey(key);
  };

  const handleCheckOpen = (check: DisplayProcessCheck) => {
    if (!check.actionKey || readOnly || canPerformAction?.(check.actionKey) === false) return;
    if (INLINE_EDITOR_CHECK_KEYS.has(check.key)) {
      openCheck(check.key);
      return;
    }
    onAction?.(check.actionKey);
  };

  if (!readiness && !checksOverride) return null;

  // Ray'dan seçilen alanın görevleri; modern detay listesi mevcut alan için de
  // açıkça geçilir. Eski store listesi yalnız fallback'tir.
  const rawChecks: DisplayProcessCheck[] = availableChecks;
  const checks: DisplayProcessCheck[] = rawChecks.map((check) => ({
    ...check,
    actionKey: check.actionKey ?? CHECK_ACTION_BY_KEY[check.key],
  }));
  const activeCheck = activeCheckKey
    ? availableChecks.find((item) => item.key === activeCheckKey)
    : undefined;
  const aPlusClosingGates = grade === "a_plus"
    ? [
        {
          key: "invoice",
          label: "Ticari fatura",
          checks: checks.filter((check) => check.key === "commercial_invoice" || check.key === "commercial_invoice_file"),
        },
        {
          key: "installation",
          label: "Kurulum",
          checks: checks.filter((check) => check.key === "installation" || check.key === "installation_completed"),
        },
      ].filter((gate) => gate.checks.length > 0)
    : [];

  /** Bir düzenleyicinin kaydetme sarmalayıcısı: kilit, hata ve tazeleme tek yerde. */
  const run = async (
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
    authorized = canUpdate,
  ) => {
    if (!authorized || busyKey) return;
    setBusyKey(key);
    try {
      await action();
      // Tazeleme burada, tek yerde: tek tek düzenleyicilere bırakıldığında
      // bazıları tazeliyor bazıları tazelemiyordu ve görev "bazen kabul
      // edilmemiş" gibi görünüyordu. İki kaynak da güncellenmeli — panel
      // store'dan, kutu kendi detay çağrısından okuyor.
      await refresh();
      await onSaved?.();
      toast.success(successMessage);
      if (requestedAction) onActionHandled?.();
    } catch (error: any) {
      toast.error("Kaydedilemedi", { description: error?.message ?? "İstek başarısız oldu." });
    } finally {
      setBusyKey(null);
    }
  };

  const body = (
    <section aria-label="Mevcut satış alanının görevleri" className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-foreground">Operasyon adımları</h3>
          {areaSteps.length > 0 && (
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              {grade === "a_plus"
                ? "Lojistik akışı · Ticari Fatura ∥ Kurulum paralel kapanış"
                : areaSteps.map((step) => salesStageLabel(step)).join(" → ")}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {checks.filter((check) => check.complete).length}/{checks.length} tamamlandı
        </span>
      </div>

      {aPlusClosingGates.length === 2 && (
        <div
          aria-label="WIN paralel kapanış koşulları"
          className="rounded-lg border border-amber-200/80 bg-amber-50/70 p-3"
        >
          <p className="text-[11px] leading-4 text-amber-950">
            WIN için ticari fatura ve kurulum paralel takip edilir; ikisi de tamamlanmalıdır.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {aPlusClosingGates.map((gate) => {
              const complete = gate.checks.every((check) => check.complete);
              return (
                <div key={gate.key} className="flex items-center gap-2 rounded-md border border-amber-200 bg-white px-2.5 py-2 text-xs font-medium">
                  {complete
                    ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                    : <Circle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">{gate.label}</span>
                  <span className="text-[10px] text-muted-foreground">{complete ? "Tamam" : "Bekliyor"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {checks.length === 0 ? (
        <p className="text-xs text-muted-foreground">Bu aşamada tamamlanacak alan yok.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {checks.map((check) => {
            const hasInlineEditor = INLINE_EDITOR_CHECK_KEYS.has(check.key);
            const actionAllowed = check.actionKey
              ? canPerformAction?.(check.actionKey) !== false
              : false;
            const completedWithoutEditor = check.complete && !hasInlineEditor;
            const disabled = readOnly || !actionAllowed || completedWithoutEditor;
            const actionLabel = readOnly
              ? "Sırası gelmedi"
              : !actionAllowed
                ? "Yetki yok"
                : completedWithoutEditor
                  ? "Tamamlandı"
                  : check.complete
                    ? check.key === "call" || check.key === "visit" ? "Görüntüle" : "Düzenle"
                    : CHECK_ACTION_LABELS[check.key] ?? "Aç";
            return (
              <li key={check.key}>
                <button
                  type="button"
                  aria-haspopup={hasInlineEditor || (check.actionKey && DIALOG_ACTION_KEYS.has(check.actionKey)) ? "dialog" : undefined}
                  aria-label={`${check.label}: ${actionLabel}`}
                  disabled={disabled}
                  onClick={() => handleCheckOpen(check)}
                  className="group flex min-h-11 w-full items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-left transition-[border-color,background-color,box-shadow,transform] hover:border-primary/25 hover:bg-primary/[0.03] active:translate-y-px disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-65 disabled:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {check.complete ? (
                    <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{check.label}</span>
                  {busyKey === check.key ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-muted-foreground transition-colors group-hover:text-primary">
                      {!disabled && <Pencil className="size-3" aria-hidden="true" />}
                      {actionLabel}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={Boolean(activeCheckKey && activeCheck)}
        onOpenChange={(open) => {
          if (!open) setActiveCheckKey(null);
        }}
      >
        {activeCheckKey && activeCheck && (
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{activeCheck.label}</DialogTitle>
              <DialogDescription>
                Bu operasyon adımına ait bilgileri burada tamamlayın. Kaydedilen durum satış alanına otomatik yansır.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-4">
              <CheckEditor
                checkKey={activeCheckKey}
                openCheck={openCheck}
                sc={sc}
                company={company}
                users={users}
                products={products}
                isSuperAdmin={isSuperAdmin}
                canCreateActivity={canCreateActivity}
                complete={activeCheck.complete}
                busy={busyKey !== null}
                disabled={readOnly || !canUpdate || busyKey !== null}
                run={run}
                updateCase={updateCase}
                updateCustomer={updateCustomer}
                decideCaseApproval={decideCaseApproval}
                refresh={refresh}
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Kapat</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );

  // Eksik özeti ve ilerletme düğmesi kutunun altında; burada tekrar etmek aynı
  // bilgiyi iki kez, ilerletmeyi iki düğmede gösterirdi.
  return body;
}

type EditorProps = {
  checkKey: string;
  sc: SalesCase;
  company: Customer | undefined;
  users: ReturnType<typeof useStore>["users"];
  products: ReturnType<typeof useStore>["products"];
  isSuperAdmin: boolean;
  canCreateActivity: boolean;
  complete: boolean;
  busy: boolean;
  disabled: boolean;
  run: (
    key: string,
    action: () => Promise<unknown>,
    successMessage: string,
    authorized?: boolean,
  ) => Promise<void>;
  updateCase: ReturnType<typeof useStore>["updateCase"];
  updateCustomer: ReturnType<typeof useStore>["updateCustomer"];
  decideCaseApproval: ReturnType<typeof useStore>["decideCaseApproval"];
  refresh: ReturnType<typeof useStore>["refresh"];
  /** Başka bir görev satırını açıp oraya kaydırır (ödeme planı → ödeme şekli). */
  openCheck: (key: string) => void;
};

/** Tek bir kontrol satırının düzenleyicisi; `checkKey` backend'in ürettiği anahtardır. */
function CheckEditor(props: EditorProps) {
  const { checkKey, sc, company, users, products, isSuperAdmin, disabled, run, openCheck } = props;
  const [draft, setDraft] = useState("");
  const [draft2, setDraft2] = useState("");

  const saveCase = (patch: Parameters<EditorProps["updateCase"]>[1], message: string) =>
    run(checkKey, () => props.updateCase(sc.id, patch), message);

  const saveCompany = (patch: Record<string, unknown>, message: string) => {
    if (!company) return Promise.resolve();
    return run(checkKey, () => props.updateCustomer(company.id, patch as any), message);
  };

  const textRow = (placeholder: string, onSave: (value: string) => void, multiline = false) => (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      {multiline ? (
        <Textarea
          className="min-h-16 bg-white text-xs"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : (
        <Input
          className="h-8 bg-white text-xs"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0"
        disabled={disabled || !draft.trim()}
        onClick={() => onSave(draft.trim())}
      >
        Kaydet
      </Button>
    </div>
  );

  const wrap = (node: ReactNode) => <div>{node}</div>;

  const activityCheck = ({
    label,
    activityTypeCode,
    subject,
    successMessage,
  }: {
    label: string;
    activityTypeCode: "outgoing_call" | "customer_visit";
    subject: string;
    successMessage: string;
  }) => {
    const inputId = `qualification-${checkKey}-note-${sc.id}`;
    const checkboxId = `qualification-${checkKey}-complete-${sc.id}`;
    const unavailable = !props.canCreateActivity || !sc.customerId;
    const activityDisabled = props.disabled || props.busy || props.complete || unavailable;

    return wrap(
      <div className="space-y-2 rounded-md bg-slate-50/80 p-2.5">
        <div className="flex min-h-8 items-center gap-2">
          <Checkbox
            id={checkboxId}
            checked={props.complete}
            disabled={activityDisabled}
            aria-describedby={`${checkboxId}-hint`}
            onCheckedChange={(checked) => {
              if (checked !== true || props.complete || unavailable) return;
              void run(
                checkKey,
                async () => {
                  await activityService.create({
                    opportunityId: sc.id,
                    companyId: sc.customerId!,
                    activityTypeCode,
                    subject,
                    activityDate: new Date(),
                    description: draft.trim() || undefined,
                  });
                  setDraft("");
                  await props.refresh();
                },
                successMessage,
                props.canCreateActivity,
              );
            }}
          />
          <label htmlFor={checkboxId} className="cursor-pointer text-xs font-medium">
            {props.complete ? `${label} olarak işaretlendi` : `${label} olarak işaretle`}
          </label>
        </div>
        {!props.complete && (
          <Input
            id={inputId}
            className="h-8 bg-white text-xs"
            placeholder={`${label} notu (isteğe bağlı)`}
            value={draft}
            disabled={activityDisabled}
            onChange={(event) => setDraft(event.target.value)}
          />
        )}
        <p id={`${checkboxId}-hint`} className="text-[10px] leading-4 text-muted-foreground">
          {!props.canCreateActivity
            ? "Aktivite oluşturma yetkiniz bulunmuyor."
            : !sc.customerId
              ? "Önce fırsata firma bağlanmalı."
              : props.complete
                ? "Tamamlanma bilgisi bağlı aktivite kaydından doğrulanır."
                : "Not yazmak zorunlu değildir. Yazılan not Aktivite bölümünde görünür."}
        </p>
      </div>
    );
  };

  switch (checkKey) {
    case "subject":
      return textRow("Satış konusu / talep başlığı", (value) => void saveCase({ title: value }, "Konu kaydedildi"));

    case "owner":
      if (!isSuperAdmin) {
        return wrap(
          <p className="text-[10px] text-muted-foreground">
            Sorumlu atamasını yalnız süper yönetici değiştirebilir.
          </p>
        );
      }
      return wrap(
        <Select
          disabled={disabled}
          onValueChange={(value) => void saveCase({ assignedUserId: value }, "Sorumlu atandı")}
        >
          <SelectTrigger size="sm" className="h-8 w-full bg-white text-xs sm:w-64">
            <SelectValue placeholder="Sorumlu seçin" />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "company":
      return wrap(
        <p className="text-[10px] text-muted-foreground">
          Aşağıdaki “Tekliften önce firma kaydı gerekli” bölümünden firmayı bağlayın; diğer alanlar firma
          bağlandıktan sonra doldurulabilir.
        </p>
      );

    case "contact":
      if (!sc.customerId) {
        return wrap(<p className="text-[10px] text-muted-foreground">Önce firma bağlanmalı.</p>);
      }
      return wrap(
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <RemoteContactCombobox
            className="h-8 w-full text-xs sm:w-72"
            companyId={sc.customerId}
            value={sc.primaryContactId ?? ""}
            disabled={disabled}
            onValueChange={(value) => {
              void saveCase(
                { primaryContactId: value || null } as Parameters<EditorProps["updateCase"]>[1],
                value ? "Kontak bağlandı" : "Kontak bağı kaldırıldı",
              );
            }}
            placeholder="Firmanın kontağını seçin"
            searchPlaceholder="Kontak ara…"
            noneLabel="Kontak bağını kaldır"
          />
          <CreateContactDialog
            defaultCustomerId={sc.customerId}
            draftKey={`draft.opportunity.${sc.id}.contact`}
            initialValues={{
              name: sc.leadContactName ?? "",
              phone: sc.leadPhone ?? "",
              email: sc.leadEmail ?? "",
              note: `${sc.requestedProduct} fırsat kartından oluşturuldu.`,
            }}
            onCreated={(contactId) => {
              void saveCase({ primaryContactId: contactId }, "Kontak oluşturuldu ve fırsata bağlandı");
            }}
            trigger={
              <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" disabled={disabled}>
                Yeni kontak oluştur
              </Button>
            }
          />
        </div>
      );

    case "location":
      return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            className="h-8 bg-white text-xs"
            placeholder="İl"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Input
            className="h-8 bg-white text-xs"
            placeholder="İlçe"
            value={draft2}
            onChange={(event) => setDraft2(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={disabled || !draft.trim() || !draft2.trim()}
            onClick={() =>
              void saveCompany({ city: draft.trim(), district: draft2.trim() }, "İl ve ilçe kaydedildi")
            }
          >
            Kaydet
          </Button>
        </div>
      );

    case "address":
      return textRow("Açık adres", (value) => void saveCompany({ address: value }, "Adres kaydedildi"), true);
    case "email":
      return textRow("ornek@firma.com", (value) => void saveCompany({ email: value }, "E-posta kaydedildi"));
    case "phone":
      return textRow("0212 xxx xx xx", (value) => void saveCompany({ phone: value }, "Telefon kaydedildi"));
    case "sector":
      return textRow("Örn. CNC Talaşlı İmalat", (value) => void saveCompany({ sector: value }, "Sektör kaydedildi"));

    case "call":
      return activityCheck({
        label: "Arama yapıldı",
        activityTypeCode: "outgoing_call",
        subject: "Giden Arama",
        successMessage: "Arama kaydedildi",
      });

    case "visit":
      return activityCheck({
        label: "Ziyaret yapıldı",
        activityTypeCode: "customer_visit",
        subject: "Müşteri Ziyareti",
        successMessage: "Ziyaret kaydedildi",
      });

    case "machine":
      return wrap(
        <RequestedMachineCombobox
          className="h-8 w-full bg-white text-xs sm:w-96"
          products={products}
          value={sc.requestedMachine}
          disabled={disabled}
          onValueChange={(value) =>
            saveCase({ requestedMachine: value }, "İstenen makine kaydedildi")
          }
        />
      );

    case "payment_method":
      // Ödeme planı diyaloğuyla aynı iki kademeli seçim: önce şekil, vadeliyse
      // vade türü. İki ekranın farklı listeler göstermesi, aynı alanı iki ayrı
      // kavramla dolduruyordu.
      return wrap(
        <PaymentMethodSelect
          value={sc.paymentMethod}
          disabled={disabled}
          size="sm"
          labels={false}
          idPrefix={`process-payment-${sc.id}`}
          className="w-full sm:w-96"
          onChange={(method) => void saveCase({ paymentMethod: method }, "Ödeme biçimi kaydedildi")}
        />
      );

    case "contract_terms":
      return textRow(
        "Sözleşme şartları (teslim, garanti, cezai şart…)",
        (value) => void saveCase({ contractTerms: value }, "Sözleşme şartları kaydedildi"),
        true
      );
    case "payment_terms": {
      // Ödeme planı, ödeme şeklinden türer: peşinde vade yazılmaz, leasingde
      // taksit tablosu firmanın değil finans kuruluşunun işidir. Şekil
      // seçilmeden boş bir metin kutusu açmak kullanıcıyı neyi yazacağını
      // bilmeden bırakıyordu — önce şekil, sonra ona göre plan.
      const method = sc.paymentMethod;
      if (!method || method === "undecided") {
        return wrap(
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Önce ödeme şeklini seçin; plan ona göre açılır.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={disabled}
              onClick={() => openCheck("payment_method")}
            >
              Ödeme şeklini seç
            </Button>
          </div>
        );
      }
      return textRow(
        PAYMENT_TERMS_PLACEHOLDER[method] ?? "Ödeme koşulları (peşinat, vade, taksit…)",
        (value) => void saveCase({ paymentTerms: value }, "Ödeme koşulları kaydedildi"),
        true
      );
    }

    // A+ alanı: beş onay. Onay yetkisi backend'de rol bazlı kontrol edilir.
    case "payment":
    case "customs":
    case "invoice":
    case "installation":
    case "win":
      return wrap(
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={disabled}
          onClick={() =>
            void run(
              checkKey,
              () => props.decideCaseApproval(sc.id, checkKey as any, "approved"),
              "Onay verildi"
            )
          }
        >
          Onayla
        </Button>
      );

    default:
      return null;
  }
}
