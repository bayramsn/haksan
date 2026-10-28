#!/usr/bin/env python3
"""Extract the supplied HEX PDF using physical cell coordinates, without aliases or power expansion."""
import argparse, datetime, hashlib, json, re, subprocess, tempfile, xml.etree.ElementTree as ET
from pathlib import Path
PAGES = {6:'H',7:'PB',8:'PG',10:'F',12:'PU',13:'EG',14:'S',15:'GR',16:'CELL',20:'T',21:'TG',22:'TH',24:'TS',25:'TZ',26:'FT',27:'PGT',30:'HW'}
NS={'x':'http://www.w3.org/1999/xhtml'}
LABELS=['Lazer Gücü','Çalışma Alanı (mm)','Çalışma Alanı (kW)-(mm)','Eğimli Kesim Çalışma Alanı (mm)','Konvansiyonel Düz Kesim (mm)','Konik Düz Kesim (mm)','Konik 45° Kesim (mm)','Pozisyonlama Hassasiyeti','Tekrarlama Hassasiyeti','Maksimum Hareket Hızı','Maksimum Hızlanma','X Eksen Motor Gücü','Y Eksen Motor Gücü','Z Eksen Motor Gücü','B Eksen Motor Gücü','Vidalı Mil','A Eksen Hareketi','C Eksen Hareketi','Maksimum Boru İşleme Uzunluğu','Yuvarlak Boru Çapı','Kare Boru Kenar Uzunluğu','Maksimum Ayna Dönüş Hızı','Parça Başına Maksimum Yük Kapasitesi','Kesim Hassasiyeti','Minimum Artık Parça Miktarı (Fire)','Ekipman Boyutu','Kaynak Dikişi Gereklilikleri','Kaynak Hızı','Soğutma Tipi','Çalışma Sıcaklığı Aralığı']
def extract(path):
 capture=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with tempfile.TemporaryDirectory() as tmp:
  xml=Path(tmp)/'bbox.xml'; subprocess.run(['pdftotext','-bbox-layout',str(path),str(xml)],check=True)
  pages=ET.parse(xml).getroot().findall('.//x:page',NS)
  result=[]
  for page,series in PAGES.items():
   words=[]; lines=[]
   for line in pages[page-1].findall('.//x:line',NS):
    ws=line.findall('x:word',NS); text=' '.join(w.text or '' for w in ws)
    lines.append((text,float(line.attrib['xMin']),float(line.attrib['yMin']),float(line.attrib['yMax'])))
    for w in ws: words.append({'text':w.text or '', 'x':(float(w.attrib['xMin'])+float(w.attrib['xMax']))/2,'y':(float(w.attrib['yMin'])+float(w.attrib['yMax']))/2})
   labels=sorted([(t,x,(y+z)/2) for t,x,y,z in lines if t in LABELS],key=lambda v:v[2])
   # Headers are immediately above the first technical field. GR labels are printed without GR prefix.
   first=labels[0][2]; headers=[]
   for w in words:
    if first-40<w['y']<first-4 and re.fullmatch(r'(?:[A-Z]{1,4}-?)?\d{4,5}(?:W|pro)?(?:-\d{1,2})?',w['text'],re.I): headers.append(w)
   headers=sorted(headers,key=lambda w:w['x'])
   if series=='GR':
    # Last two headers wrap over two lines: preserve literal source model spelling.
    headers=[w for w in headers if w['text']!='-12']
    for w in headers:
     if 'pro' in w['text'].lower(): w['text']+='-12'
   if not headers: raise ValueError(f'Missing headers page {page}')
   centers=[w['x'] for w in headers]; cutoff=centers[0]-(centers[1]-centers[0])/2 if len(centers)>1 else centers[0]-110
   configs=[]
   for i,h in enumerate(headers):
    fields=[]
    for j,(label,x,y) in enumerate(labels):
     low=(labels[j-1][2]+y)/2 if j else y-12
     high=(y+labels[j+1][2])/2 if j+1<len(labels) else y+12
     cell=[w for w in words if low<=w['y']<high and w['x']>cutoff and min(range(len(centers)),key=lambda k:abs(centers[k]-w['x']))==i]
     cell.sort(key=lambda w:(round(w['y']/3),w['x']))
     raw=' '.join(w['text'] for w in cell)
     status='needs_review' if not raw or any(c in raw for c in ['≤','≥','>',';']) or 'Motor' in label else 'verified'
     fields.append({'key':label,'rawValue':raw,'verification':status,'source':{'document':path.name,'page':page,'capturedAt':capture,'sourceModelCode':h['text'],'rawValue':raw}})
    configs.append({'sourceModelCode':h['text'],'fields':fields})
   kind='welding' if series=='HW' else 'tube' if series in ['T','TG','TH','TS','TZ'] else 'combined' if series in ['FT','PGT'] else '3d' if series=='CELL' else 'sheet'
   result.append({'series':series,'brand':'HEXLASER','kind':kind,'page':page,'configurations':configs,'standardCabin': 'open' if series in ['F','EG','FT'] else 'closed' if series in ['H','PB','PG','PU','S','PGT'] else None,'powerOptions':[1.5,2,3] if series=='HW' else [],'powerPolicy':'range_is_not_discrete_options','saleStatus':'requires_configuration_review'})
 return {'schemaVersion':1,'revision':'hexlaser-2026-v1','capturedAt':capture,'document':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'series':result}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('pdf',type=Path);p.add_argument('--output',type=Path,required=True);a=p.parse_args(); data=extract(a.pdf);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n'); Path('packages/shared/src/hexlaser-2026-data.ts').write_text('// Generated literal PDF cells; no inferred aliases.\nexport const HEXLASER_2026_MANIFEST = '+json.dumps(data,ensure_ascii=False,indent=2)+';\n');print(json.dumps({'series':len(data['series']),'configurations':sum(len(s['configurations']) for s in data['series'])}))
