"""Cache/OCR source-embedded technical images without changing reviewed specs."""
import base64,hashlib,json,subprocess,time,urllib.request
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor,as_completed
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'reports/technical-backfill-20261014';cache=OUT/'technical-images';cache.mkdir(exist_ok=True)
data=json.loads((OUT/'source-enriched.json').read_text());sources={}
for p in data['products']:
 html=BeautifulSoup((OUT/'source-html'/(str(p['sourceId'])+'.html')).read_text(),'html.parser')
 tab=html.select_one('#tab-content-1');images=[]
 for image in tab.select('img[src]') if tab else []:
  uri=image['src'];host=urlparse(uri).hostname
  if not uri.startswith('data:image/') and not host:continue
  digest=hashlib.sha256(uri.encode()).hexdigest()[:20];ref='embedded:'+digest if uri.startswith('data:') else uri
  images.append({'sourceImage':ref,'imageId':digest});sources.setdefault(digest,{'uri':uri,'sourceImage':ref,'productIds':[]})['productIds'].append(p['sourceId'])
 p['technicalImages']=images

def fetch(item):
 digest,source=item;target=cache/(digest+'.image');out=cache/(digest+'.ocr.json')
 if not target.exists():
  uri=source['uri']
  if uri.startswith('data:'):body=base64.b64decode(uri.split(',',1)[1])
  else:
   time.sleep(.3)
   uri = uri.replace('http://www.haksanmakina.com.tr/', 'https://www.haksanmakina.com.tr/')
   req=urllib.request.Request(uri,headers={'User-Agent':'HaksanCRM-TechnicalReview/1.0'})
   try:
    response=urllib.request.urlopen(req,timeout=7)
   except Exception:
    if uri.startswith('http://'):response=urllib.request.urlopen(urllib.request.Request('https://'+uri[7:],headers={'User-Agent':'HaksanCRM-TechnicalReview/1.0'}),timeout=7)
    else:raise
   with response:body=response.read(10_000_001)
  if len(body)>10_000_000:raise ValueError('Image exceeds10MB')
  target.write_bytes(body)
 if not out.exists():
  result=subprocess.run(['/tmp/haksan-ocr-cpu',str(target)],capture_output=True,text=True,check=True,timeout=20)
  out.write_text(result.stdout)
 return {'imageId':digest,'sourceImage':source['sourceImage'],'productIds':source['productIds'],'localPath':str(target),'ocrPath':str(out),'observations':json.loads(out.read_text())}
priority={str(p['sourceId']) for p in data['products'] if not p.get('specs') and p['group'] != 'CNC'}
ordered = sorted(sources.items(), key=lambda pair: not any(str(sid) in priority for sid in pair[1]['productIds']))
results=[];errors=[]
with ThreadPoolExecutor(max_workers=3) as pool:
 futures={pool.submit(fetch,item):item for item in ordered}
 for future in as_completed(futures):
  digest,source=futures[future]
  try:results.append(future.result())
  except Exception as error:errors.append({'imageId':digest,'sourceImage':source['sourceImage'],'productIds':source['productIds'],'error':str(error)[:400]})
(OUT/'source-image-ocr.json').write_text(json.dumps({'results':results,'errors':errors},ensure_ascii=False,indent=2)+'\n')
(OUT/'source-enriched.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'images':len(sources),'decoded':len(results),'errors':errors},ensure_ascii=False))
