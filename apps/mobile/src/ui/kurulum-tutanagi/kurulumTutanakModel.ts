import {
  deliveryCompanyName,
  deliveryFormData,
  deliveryFormNo,
  deliverySignedBy,
  deliveryStatusCode,
  formatDeliveryDate,
} from '@/src/ui/deliveries/deliveryHelpers';
import {
  formatInstallationDate,
  installationCode,
  installationCompany,
  installationDurationDisplay,
  installationTechnician,
} from '@/src/ui/installations/installationHelpers';

export type KurulumTutanakField = {
  marka: string;
  tip: string;
  model: string;
  seriNo: string;
  mainSw?: string;
};

export type KurulumTutanakModel = {
  formNo: string;
  subtitle: string;
  status: 'ready' | 'pending';
  teslimTarihi: string;
  kurulumTarihi: string;
  tezgah: KurulumTutanakField;
  cnc: KurulumTutanakField;
  musteri: { firma: string; ilgili: string; adres: string };
  kurulum: { yapan: string; sure: string };
  signedBy: string;
};

function textValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return '';
}

function field(...values: unknown[]): string {
  return firstText(...values) || '—';
}

function splitControlUnit(value: unknown): { marka: string; model: string } {
  const text = firstText(value);
  if (!text) return { marka: '', model: '' };
  const [marka, ...modelParts] = text.split(/\s+/);
  return { marka: marka ?? '', model: modelParts.join(' ') };
}

function tezgahFrom(fd: ReturnType<typeof deliveryFormData>): KurulumTutanakField {
  const t = fd.tezgah ?? {};
  return {
    marka: field(t.marka),
    tip: field(t.tip),
    model: field(t.model),
    seriNo: field(t.seriNo),
  };
}

function cncFrom(fd: ReturnType<typeof deliveryFormData>): KurulumTutanakField {
  const c = fd.cnc ?? {};
  return {
    marka: field(c.marka),
    tip: '—',
    model: field(c.model),
    seriNo: field(c.seriNo),
    mainSw: field(c.mainSw),
  };
}

/** Teslimat (deliveries) kaydından tutanak modeli — DR.MAK */
export function tutanakFromDelivery(row: Record<string, unknown>): KurulumTutanakModel {
  const fd = deliveryFormData(row);
  const company = row.company as Record<string, unknown> | undefined;
  const adres = [company?.address, company?.district, company?.city].filter(Boolean).join(' ');

  return {
    formNo: deliveryFormNo(row),
    subtitle: `${deliveryFormNo(row)} · ${deliveryCompanyName(row)}`,
    status: deliveryStatusCode(row) === 'completed' ? 'ready' : 'pending',
    teslimTarihi: formatDeliveryDate(row),
    kurulumTarihi: fd.kurulumTarihi ? formatDeliveryDate({ deliveryDate: fd.kurulumTarihi }) : '—',
    tezgah: tezgahFrom(fd),
    cnc: cncFrom(fd),
    musteri: {
      firma: deliveryCompanyName(row),
      ilgili: field(fd.ilgili),
      adres: field(String(adres || row.location || '')),
    },
    kurulum: {
      yapan: field(fd.kurulumuYapan),
      sure: '—',
    },
    signedBy: deliverySignedBy(row),
  };
}

/** Saha kurulum kaydından tutanak modeli */
export function tutanakFromInstallation(row: Record<string, unknown>): KurulumTutanakModel {
  const device = row.customerDevice as Record<string, unknown> | undefined;
  const contact = row.contact as Record<string, unknown> | undefined;
  const company = row.company as Record<string, unknown> | undefined;
  const controlUnit = firstText(device?.controlUnit);
  const controlUnitParts = splitControlUnit(controlUnit);
  const controlUnitSerial = firstText(device?.controlUnitSerialNumber, device?.controlUnitSerial);
  const adres = [company?.address, company?.district, company?.city, row.location]
    .filter(Boolean)
    .join(' ');

  const tezgah: KurulumTutanakField = device
    ? {
        marka: field(device.brandName, device.brand),
        tip: field(device.productTypeName, device.type),
        model: field(device.model, device.modelCode, device.productModelName, device.modelName),
        seriNo: field(device.serialNumber),
      }
    : { marka: '—', tip: '—', model: '—', seriNo: '—' };

  const cnc: KurulumTutanakField = controlUnit || controlUnitSerial
    ? {
        marka: field(controlUnitParts.marka),
        tip: '—',
        model: field(controlUnitParts.model),
        seriNo: field(controlUnitSerial),
        mainSw: '—',
      }
    : { marka: '—', tip: '—', model: '—', seriNo: '—' };

  const code = installationCode(row);
  const completed = Boolean(row.completedAt);
  const statusCode = String((row.status as Record<string, unknown> | undefined)?.code ?? row.statusCode ?? '').toLowerCase();

  return {
    formNo: code,
    subtitle: `${code} · ${installationCompany(row)}`,
    status: completed || statusCode === 'completed' ? 'ready' : 'pending',
    teslimTarihi: formatInstallationDate(row.completedAt ?? row.scheduledDate),
    kurulumTarihi: formatInstallationDate(row.completedAt ?? row.scheduledDate),
    tezgah,
    cnc,
    musteri: {
      firma: installationCompany(row),
      ilgili: field(String(contact?.fullName ?? '')),
      adres: field(adres),
    },
    kurulum: {
      yapan: installationTechnician(row),
      sure: installationDurationDisplay(row) ?? '—',
    },
    signedBy: '—',
  };
}

/** @deprecated use tutanakFromInstallation */
export function deliveryTutanakFromInstallation(row: Record<string, unknown>): Record<string, unknown> {
  const m = tutanakFromInstallation(row);
  return {
    id: row.id,
    companyId: row.companyId,
    company: row.company,
    deliveryDate: row.completedAt ?? row.scheduledDate,
    signedBy: m.signedBy,
    status: m.status === 'ready' ? 'completed' : 'pending',
    formData: {
      formNo: m.formNo,
      kurulumTarihi: row.completedAt ?? row.scheduledDate,
      ilgili: m.musteri.ilgili,
      kurulumuYapan: m.kurulum.yapan,
      tezgah: m.tezgah,
      cnc: m.cnc,
    },
  };
}
