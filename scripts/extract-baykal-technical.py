from html.parser import HTMLParser
from pathlib import Path
import re,json
class Tables(HTMLParser):
 def __init__(self):super().__init__();self.tables=[];self.rows=None;self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='table':self.rows=[]
  if self.rows is not None and tag=='tr':self.row=[]
  if self.row is not None and tag in ['td','th']:self.cell=''
  if self.cell is not None and tag=='br':self.cell+=' '
 def handle_data(self,data):
  if self.cell is not None:self.cell+=data
 def handle_endtag(self,tag):
  if tag in ['td','th'] and self.cell is not None:self.row.append(re.sub(r'\s+',' ',self.cell).strip());self.cell=None
  if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None
  if tag=='table' and self.rows is not None:self.tables.append(self.rows);self.rows=None

# Page selection is explicit because hydraulic, mild hybrid and hybrid tables differ.
PAGES = {
 'APEX (O TYPE HYDRAULIC)': 'apex', 'APHS (C TYPE) HYDRAULIC': 'aphs',
 'APHS (C TYPE) MILD HYBRID': 'aphs-mild-hybrid', 'APHS (C TYPE) HYBRID': 'aphs-hybrid',
 'APHS PRO ( BOX TYPE ) HYDRAULIC': 'aphs-pro', 'APHS PRO BOX MILD HYBRID': 'aphs-pro-mild-hybrid',
 'APHS PRO ( BOX TYPE ) HYBRID': 'aphs-pro-hybrid', 'APEB':'apeb-servo','APES':'apes-servo',
 'HNC':'hnc','MGH':'mgh','HGL':'hgl','BLS PRO':'bls-pro','BLP':'blp','BLU':'blu','BLE PRO':'ble-pro',
 'BLX':'blx','BLM':'blm','BLT':'blt','BLC':'blc','BPL H':'bpl-h','BPS':'bps',
}
PRESS = [('Bükme Kuvveti','kN'),('Yağ Tankı Kapasitesi','L'),('Motor Gücü','kW'),('İniş Hızı','mm/s'),('Bükme Hızı','mm/s'),('Kalkış Hızı','mm/s'),('Makine Ağırlığı','ton'),('Bükme Uzunluğu','mm'),('Ayaklar Arası Mesafe','mm'),('Yan Gövde Genişliği','mm'),('Önden Toplam Genişlik','mm'),('Tabla Yüksekliği','mm'),('Makine Yüksekliği','mm'),('Çene Açıklığı','mm'),('Strok','mm'),('Tabla Genişliği','mm')]
SERVO = [('Bükme Kuvveti','kN'),('Motor Gücü','kW'),('İniş Hızı','mm/s'),('Bükme Hızı','mm/s'),('Kalkış Hızı','mm/s'),('Makine Ağırlığı','ton'),('Bükme Uzunluğu','mm'),('Ayaklar Arası Mesafe','mm'),('Yan Gövde Genişliği','mm'),('Tabla Yüksekliği','mm'),('Makine Yüksekliği','mm'),('Çene Açıklığı','mm'),('Strok','mm'),('Tabla Genişliği','mm')]
SHEAR = [('Kesme Kapasitesi (450 N/mm²)','mm'),('Kesme Kapasitesi (700 N/mm²)','mm'),('Kesme Boyu','mm'),('Kesme Açısı','°'),('Motor Gücü','kW')]
LABELS = {
 'CNC Control Unit':'Kontrol Ünitesi','Motors & Drivers':'Motor ve Sürücü Markası','Linear Motors & Drivers':'Motor ve Sürücü Markası',
 'Rapid Traverse':'Hızlı Hareket Hızı','Rapid Speed':'Hızlı Hareket Hızı','Vector Speed':'Vektörel Hız','Acceleration':'İvme',
 'Absolute Positioning Accuracy':'Konumlama Hassasiyeti','Repeatability':'Tekrarlama Hassasiyeti','Repeatability (X & Y Axis)':'Tekrarlama Hassasiyeti',
 'Max. Tube Length':'Maks. Boru Uzunluğu','Max. Part Length':'Maks. Parça Uzunluğu','Min. Auto Loading Length':'Min. Otomatik Yükleme Uzunluğu',
 'Acceleration of Driver Chuck':'Ayna İvmesi','Speed of Driver Chuck':'Ayna Hızı','Types of Profiles':'İşlenebilen Profil Tipleri',
 'Min. / Max. Round Diameter':'Yuvarlak Boru Çap Aralığı','Min. / Max. Square Diameter':'Kare Profil Ölçü Aralığı',
 'Length of Last Part':'Son Parça Uzunluğu','Max. Tube Weight':'Maks. Boru Ağırlığı','Min. Material Thickness':'Min. Malzeme Kalınlığı',
 'Linear Rail Guides':'Lineer Kızak Markası','Feed Rate':'İlerleme Hızı','Mechanical Accuracy':'Mekanik Hassasiyet',
 'Nozzle Cleaning & Calibration':'Nozul Temizleme ve Kalibrasyon','Nozzle Cleaning and Calibration':'Nozul Temizleme ve Kalibrasyon',
}

def normal(s): return re.sub('[^A-Z0-9]','',s.upper())
def spec(key,value,unit=''):
 value=value.strip()
 if unit=='°':value=value.replace('°','')
 return dict(key=key,value=value,unit=unit)

def extract(cache, workbook):
 products=[];unresolved=[]
 for product in workbook['products']:
  page=PAGES[product['sheet']];url='https://www.baykal.com.tr/tr/products/'+page+'.html'
  parser=Tables();parser.feed((cache/(page+'.html')).read_text())
  if not parser.tables:
   unresolved.append(dict(workbookProductId=product['id'],reason='Üretici tablosu yok'));continue
  rows=parser.tables[0];values=[];notes=[]
  if page.startswith('aphs') or page in ['apex','apeb-servo','apes-servo','hnc','mgh','hgl']:
   code=re.search(r'\d+$',product['modelCode']).group()
   # Spelling aliases verified against the workbook's separate length and force cells.
   code={'2180':'21080','260110':'26110'}.get(code,code)
   matches=[r for r in rows if len(r)>5 and re.search(r'\d+$',r[0]) and re.search(r'\d+$',r[0]).group()==code]
   if len(matches)!=1:
    unresolved.append(dict(workbookProductId=product['id'],reason='Tam model üretici tablosunda yok',sourceUrl=url));continue
   row=matches[0];data=row[1:]
   if page.startswith('aphs'):
    labels=PRESS+([('Promecam Adaptör Yüksekliği','mm')] if '-pro' in page else [('Boğaz Derinliği','mm'),('Adaptör Yüksekliği','mm')])
   elif page in ['apeb-servo','apes-servo']:labels=SERVO
   elif page=='apex':
    # The last two columns both say Stroke; preserve their drawing identifiers.
    labels=[('Bükme Kuvveti','ton')]+SERVO[1:9]+[('Önden Toplam Genişlik','mm'),('Tabla Yüksekliği','mm'),('Makine Yüksekliği','mm'),('Çene Açıklığı','mm'),('Çalışma Alanı (L)','mm'),('Tabla Genişliği','mm'),('Boğaz Derinliği','mm'),('Strok (R)','mm'),('Strok (ST)','mm')]
   else:
    labels=SHEAR+([('Çalışma Basıncı','kg/cm²')] if page=='hnc' else [])+[('Baskı Sayısı','adet'),('Strok Sayısı','strok/dk'),('Yağ Tankı Kapasitesi','L'),('Arka Dayama Mesafesi','mm'),('Arka Dayama Motoru','kW'),('Makine Ağırlığı','kg')]
   if len(data)!=len(labels):raise ValueError((page,row[0],len(data),len(labels)))
   values=[spec(k,v,u) for (k,u),v in zip(labels,data)]
   notes.append('Üretici tablo satırı: '+row[0])
  elif page=='blc':
   # Manufacturer page lacks model columns and has a contradictory 0.08 mm wall thickness.
   unresolved.append(dict(workbookProductId=product['id'],reason='BLC tablo konfigürasyonu ve 0.08 mm değeri doğrulanmalı',sourceUrl=url));continue
  else:
   for row in rows:
    if not row or row[0] not in LABELS:continue
    v=row[1:]
    if page=='blt' and row[0]=='Max. Tube Length':v=[row[1 if '6220' in product['modelCode'] else 2]]
    # Multiple table columns describe alternative drive/control configurations.
    if not v or len(set(v))!=1:continue
    if any(x in v[0].lower() for x in ['optional','depends']):continue
    # Workbook explicitly specifies controller/hardware and takes precedence over website revisions.
    if row[0] in ['CNC Control Unit','Motors & Drivers','Linear Motors & Drivers']:continue
    if page=='blx' and '12 KW' in product['modelCode']:continue
    values.append(spec(LABELS[row[0]],v[0]))
  if values:products.append(dict(workbookProductId=product['id'],modelCode=product['modelCode'],sheet=product['sheet'],sourceUrls=[url],specs=values,notes=notes))
 return dict(capturedOn='2026-11-07',products=products,unresolved=unresolved)

if __name__=='__main__':
 import argparse
 cli=argparse.ArgumentParser();cli.add_argument('cache',type=Path);cli.add_argument('--output',type=Path,default=Path('apps/api/src/db/seed/data/baykal-2026-technical.json'));args=cli.parse_args()
 book=json.loads(Path('apps/api/src/db/seed/data/baykal-2026-price-list.json').read_text());result=extract(args.cache,book)
 args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(len(result['products']),sum(len(x['specs']) for x in result['products']),'values',len(result['unresolved']),'unresolved')
