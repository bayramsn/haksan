import { printDocument } from '../../native/print-document';
import type { InstallationFormDraft } from './logistics';
import type { DispatchNoteData } from './ShipmentDocuments';
export function installationPrint(form: InstallationFormDraft, extra: { location?: string|null; duration?: string|null; notes?: string|null }={}) {
  const rows=(pairs:[string,string|number|null|undefined][])=>pairs.map(([label,value])=>({label,value}));
  return printDocument({title:'Kurulum Tutanağı',subtitle:form.formNo,sections:[
    {title:'Tutanak',rows:rows([['Teslim tarihi',form.teslimTarihi],['Kurulum tarihi',form.kurulumTarihi],['Kurulum yeri',extra.location],['Süre',extra.duration]])},
    {title:'Tezgah',rows:rows([['Marka',form.tezgahMarka],['Tip',form.tezgahTip],['Model',form.tezgahModel],['Seri no',form.tezgahSeriNo]])},
    {title:'Kontrol ünitesi',rows:rows([['Marka',form.cncMarka],['Model',form.cncModel],['Seri no',form.cncSeriNo],['Yazılım',form.cncMainSw]])},
    {title:'Müşteri',rows:rows([['Firma',form.firma],['İlgili',form.ilgili],['Adres',form.adres],['Telefon',form.telefon],['Faks',form.faks],['GSM',form.gsm],['E-posta',form.eposta]])},
    {title:'Tezgah kontrol çizelgesi',rows:form.checks.map(check=>({label:check.label,value:`${check.status==='done'?'Tamamlandı':check.status==='not_done'?'Tamamlanmadı':'—'}${check.note?` · ${check.note}`:''}`}))},
    {title:'Problem kontrolü',rows:rows([['Problem var mı?',form.problemHasProblem==='yes'?'Evet':form.problemHasProblem==='no'?'Hayır':'—'],['Açıklama',form.problemNote],['Yapılan işlem',form.problemActionNote]])},
    {title:'Notlar',lines:extra.notes?[extra.notes]:[]},
    {title:'İmza alanları',rows:rows([['Kurulumu yapan',form.kurulumuYapan],['Tezgahı teslim alan',form.teslimAlan]])},
  ]});
}
export function dispatchPrint(data:DispatchNoteData) {
  return printDocument({title:'Sevk İrsaliyesi',subtitle:data.irsaliyeNo,sections:[
    {title:'Sevkiyat',rows:[{label:'Tarih',value:data.tarih},{label:'Taşıyıcı',value:data.carrier},{label:'Takip no',value:data.trackingNo},{label:'Çıkış',value:data.origin},{label:'Varış',value:data.destination},{label:'Teslim şekli',value:data.incoterm},{label:'Tahmini varış',value:data.eta}]},
    {title:'Alıcı',rows:[{label:'Firma',value:data.firma},{label:'Adres',value:data.adres},{label:'Vergi dairesi / no',value:data.vergi}]},
    {title:'Sevk edilen kalemler',rows:data.items.map((item,index)=>({label:`${index+1}. ${item.description??'Kalem'}`,value:[item.serialNumber,item.quantity,item.unit].filter(Boolean).join(' · ')}))},
    {title:'Notlar',lines:data.notlar?[data.notlar]:[]},
  ]});
}
