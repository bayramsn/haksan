import { Text, View } from 'react-native';
import { CrmDocumentShare, DocRow, DocTitle } from './DocumentCapture';
import type { InstallationFormDraft } from './logistics';

function trDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

const CHECK_LABEL: Record<string, string> = { done: 'Tamamlandı', not_done: 'Tamamlanmadı' };

/** Kurulum tutanağı önizlemesi; PDF CRM'den indirilir (yerel üretim yok). */
export function InstallationDocument({
  form,
  fileName,
  location,
  duration,
  notes,
  fileId,
}: {
  form: InstallationFormDraft;
  fileName: string;
  location?: string | null;
  duration?: string | null;
  notes?: string | null;
  fileId?: string | null;
}) {
  const problem = form.problemHasProblem === 'yes' ? 'Evet' : form.problemHasProblem === 'no' ? 'Hayır' : '';
  const pdfName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  return (
    <View className="gap-3">
      <View className="rounded-surface border border-border bg-card p-4">
      <Text className="font-display-semibold text-lg text-foreground">Kurulum Tutanağı</Text>
      <DocRow label="Form No" value={form.formNo} />
      <DocRow label="Tezgah Teslim Tarihi" value={trDay(form.teslimTarihi)} />
      <DocRow label="Tezgah Kurulum Tarihi" value={trDay(form.kurulumTarihi)} />
      {location ? <DocRow label="Kurulum Yeri" value={location} /> : null}
      {duration ? <DocRow label="Süre" value={duration} /> : null}

      <DocTitle>Tezgah Bilgileri</DocTitle>
      <DocRow label="Tezgah Markası" value={form.tezgahMarka} />
      <DocRow label="Tezgah Tipi" value={form.tezgahTip} />
      <DocRow label="Tezgah Modeli" value={form.tezgahModel} />
      <DocRow label="Tezgah Seri No" value={form.tezgahSeriNo} />

      <DocTitle>Kontrol Ünitesi Bilgileri</DocTitle>
      <DocRow label="Cnc Markası" value={form.cncMarka} />
      <DocRow label="Cnc Modeli" value={form.cncModel} />
      <DocRow label="Cnc Seri No" value={form.cncSeriNo} />
      <DocRow label="Cnc Main S/W" value={form.cncMainSw} />

      <DocTitle>Kullanıcı Bilgileri</DocTitle>
      <DocRow label="Firma" value={form.firma} />
      <DocRow label="İlgili" value={form.ilgili} />
      <DocRow label="Adres" value={form.adres} />
      <DocRow label="Telefon" value={form.telefon} />
      <DocRow label="Faks" value={form.faks} />
      <DocRow label="Gsm" value={form.gsm} />
      <DocRow label="E-Posta" value={form.eposta} />

      {form.checks.length ? (
        <>
          <DocTitle>Tezgah Kontrol Çizelgesi</DocTitle>
          {form.checks.map((check) => (
            <View key={check.id} className="border-b border-border py-1.5">
              <View className="flex-row gap-3">
                <Text className="flex-1 font-inter text-[12px] text-foreground">{check.label}</Text>
                <Text className="font-inter-semibold text-[12px] text-foreground">{CHECK_LABEL[check.status] ?? '—'}</Text>
              </View>
              {check.note.trim() ? <Text className="font-inter text-[11px] text-muted-foreground">{check.note}</Text> : null}
            </View>
          ))}
        </>
      ) : null}

      {problem ? (
        <>
          <DocTitle>Kurulumda Problem Kontrolü</DocTitle>
          <DocRow label="Problem var mı?" value={problem} />
          <DocRow label="Açıklama" value={form.problemNote} />
          <DocRow label="Yapılan İşlem" value={form.problemActionNote} />
        </>
      ) : null}

      {notes ? (
        <>
          <DocTitle>Notlar</DocTitle>
          <Text className="font-inter text-[12px] text-foreground">{notes}</Text>
        </>
      ) : null}

      <DocTitle>İmza Bilgileri</DocTitle>
      <View className="flex-row gap-3 pt-1">
        <SignatureBox label="Kurulumu Yapan" name={form.kurulumuYapan} />
        <SignatureBox label="Tezgahı Teslim Alan" name={form.teslimAlan} />
      </View>
      </View>
      <CrmDocumentShare fileId={fileId} filename={pdfName} label="CRM'den tutanak PDF indir" />
    </View>
  );
}

function SignatureBox({ label, name }: { label: string; name: string }) {
  return (
    <View className="h-24 flex-1 justify-between rounded-control border border-border p-2">
      <Text className="font-inter text-[11px] text-muted-foreground">{label}</Text>
      <Text className="font-inter-semibold text-[12px] text-foreground">{name || ' '}</Text>
    </View>
  );
}
