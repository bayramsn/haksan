import { Text, View } from 'react-native';
import { formatDate } from '@/src/lib/format';
import { DocRow, DocTitle, DocumentCapture } from './DocumentCapture';

/** Web print/templates.ts `HAKSAN` gönderici bilgileri (etiket ve irsaliye altbilgisi). */
const HAKSAN = {
  unvan: 'HAKSAN TAKIM TEZGAHLARI MAKİNA SAN. Ve TİC. LTD. ŞTİ.',
  adres: 'Yenidoğan Mah. Eyüp Sultan Cad. No: 24 Bayrampaşa, İstanbul',
  tel: '0 (212) 567 33 31',
  faks: '0 (212) 565 70 58',
  vergi: 'Bayrampaşa / 455 001 1269',
};

/** Web cargoLabelDoc: gönderici HAKSAN, alıcı firma/adres/telefon. */
export function CargoLabelDocument({ firma, adres, ilceSehir, tel }: { firma: string; adres: string; ilceSehir: string; tel: string }) {
  return (
    <DocumentCapture title="Kargo Etiketi" fileName="kargo-etiketi">
      <View className="gap-1 border-b border-border pb-3">
        <Text className="font-inter text-[11px] uppercase text-muted-foreground">Gönderen</Text>
        <Text className="font-inter-semibold text-[13px] text-foreground">{HAKSAN.unvan}</Text>
        <Text className="font-inter text-[12px] text-foreground">{HAKSAN.adres}</Text>
        <Text className="font-inter text-[12px] text-foreground">Tel: {HAKSAN.tel}</Text>
      </View>
      <View className="gap-2 pt-3">
        <Text className="font-inter text-[11px] uppercase text-muted-foreground">Alıcı</Text>
        <Text className="font-display-semibold text-[22px] text-foreground">{firma}</Text>
        {adres ? <Text className="font-inter text-[16px] text-foreground">{adres}</Text> : null}
        {ilceSehir ? <Text className="font-inter-semibold text-[16px] text-foreground">{ilceSehir}</Text> : null}
        {tel ? <Text className="font-inter-semibold text-[16px] text-foreground">Tel: {tel}</Text> : null}
      </View>
    </DocumentCapture>
  );
}

export type DispatchNoteData = {
  irsaliyeNo: string;
  tarih: string | null;
  carrier: string | null;
  trackingNo: string | null;
  origin: string | null;
  destination: string | null;
  incoterm: string | null;
  eta: string | null;
  firma: string | null;
  adres: string | null;
  vergi: string | null;
  items: { description: string | null; serialNumber?: string | null; quantity: string | null; unit?: string | null }[];
  notlar: string | null;
};

/** Web dispatchNoteDoc ("SEVK İRSALİYESİ"). */
export function DispatchNoteDocument({ data }: { data: DispatchNoteData }) {
  return (
    <DocumentCapture title="Sevk İrsaliyesi" fileName={`sevk-irsaliyesi-${data.irsaliyeNo}`}>
      <Text className="font-display-semibold text-lg text-foreground">SEVK İRSALİYESİ</Text>
      <DocRow label="İrsaliye No" value={data.irsaliyeNo} />
      <DocRow label="Tarih" value={data.tarih ? formatDate(data.tarih) : null} />
      <DocRow label="Taşıyıcı" value={data.carrier} />
      <DocRow label="Takip No" value={data.trackingNo} />
      <DocRow label="Rota" value={[data.origin, data.destination].filter(Boolean).join(' → ')} />
      <DocRow label="Teslim Şekli" value={data.incoterm} />
      <DocRow label="Tahmini Varış" value={data.eta ? formatDate(data.eta) : null} />

      <DocTitle>Alıcı / Müşteri</DocTitle>
      <DocRow label="Firma" value={data.firma} />
      <DocRow label="Adres" value={data.adres} />
      <DocRow label="Vergi D. / No" value={data.vergi} />

      <DocTitle>Sevk Edilen Kalemler</DocTitle>
      {data.items.length ? (
        data.items.map((item, index) => (
          <View key={`${index}-${item.description ?? ''}`} className="flex-row gap-2 border-b border-border py-1.5">
            <Text className="w-6 font-inter text-[12px] text-muted-foreground">{index + 1}</Text>
            <View className="flex-1">
              <Text className="font-inter-medium text-[12px] text-foreground">{item.description || '—'}</Text>
              {item.serialNumber ? <Text className="font-inter text-[11px] text-muted-foreground">Seri No: {item.serialNumber}</Text> : null}
            </View>
            <Text className="font-inter-semibold text-[12px] text-foreground">
              {`${item.quantity ? Number(item.quantity) : 1} ${item.unit || 'adet'}`}
            </Text>
          </View>
        ))
      ) : (
        <Text className="py-2 font-inter text-[12px] italic text-muted-foreground">Kalem yok</Text>
      )}

      {data.notlar ? (
        <>
          <DocTitle>Notlar</DocTitle>
          <Text className="font-inter text-[12px] text-foreground">{data.notlar}</Text>
        </>
      ) : null}

      <View className="flex-row gap-3 pt-4">
        <View className="h-20 flex-1 justify-between rounded-control border border-border p-2">
          <Text className="font-inter-semibold text-[11px] text-foreground">TESLİM EDEN</Text>
          <Text className="font-inter text-[10px] text-muted-foreground">İmza / Kaşe</Text>
        </View>
        <View className="h-20 flex-1 justify-between rounded-control border border-border p-2">
          <Text className="font-inter-semibold text-[11px] text-foreground">TESLİM ALAN</Text>
          <Text className="font-inter text-[10px] text-muted-foreground">Ad, Soyad / İmza</Text>
        </View>
      </View>
      <Text className="pt-3 font-inter text-[10px] text-muted-foreground">
        {`${HAKSAN.unvan} · ${HAKSAN.adres} · Tel: ${HAKSAN.tel} Faks: ${HAKSAN.faks} · Vergi: ${HAKSAN.vergi}`}
      </Text>
    </DocumentCapture>
  );
}
