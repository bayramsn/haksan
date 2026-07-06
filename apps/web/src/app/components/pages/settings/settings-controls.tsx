import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Switch } from "../../ui/switch";
import { cn } from "../../ui/utils";

export type SectionTone = "primary" | "info" | "success" | "warning" | "muted";

// Alfa tabanlı tonlar; hem açık hem koyu temada güvenli (soft token'lar dark'ta
// açık kalırdı, /10 alfa ise token rengiyle uyumlu).
const TONE_BADGE: Record<SectionTone, string> = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  muted: "bg-muted text-muted-foreground",
};

const CALLOUT_SURFACE: Record<SectionTone, string> = {
  primary: "border-primary/20 bg-primary/5",
  info: "border-info/20 bg-info/5",
  success: "border-success/25 bg-success/5",
  warning: "border-warning/25 bg-warning/5",
  muted: "border-border/60 bg-muted/30",
};

export function SettingsField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}

export function SettingsSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Premium bölüm kartı: renkli ikon rozeti + başlık + açıklama + opsiyonel aksiyon.
export function SettingsSection({
  icon,
  tone = "primary",
  title,
  description,
  action,
  children,
  bodyClassName,
}: {
  icon: ReactNode;
  tone?: SectionTone;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm transition-shadow duration-200 hover:shadow-md">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-gradient-to-b from-muted/25 to-transparent px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]", TONE_BADGE[tone])}>{icon}</span>
          <div className="min-w-0">
            <h4 className="font-medium leading-tight">{title}</h4>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

export function InfoCallout({ icon, tone = "info", children }: { icon?: ReactNode; tone?: SectionTone; children: ReactNode }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", CALLOUT_SURFACE[tone])}>
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", TONE_BADGE[tone])}>
        {icon ?? <Info />}
      </span>
      <div className="pt-0.5 text-foreground/80">{children}</div>
    </div>
  );
}

export function SettingsToggle({
  label,
  description,
  icon,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  icon?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">{icon}</span>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium leading-tight">{label}</div>
          {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
