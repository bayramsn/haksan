import { fetch as expoFetch } from 'expo/fetch';
import { apiBaseUrl } from '@/src/api/config';
import { requestContextKey } from '@/src/api/client';
import { MAX_PRINT_IMAGE_BYTES, productPrintImageUrl, rasterDataImage } from './print-image-policy';
/** Public product marketing media only. No token, cookies or customer fields leave the app. */
export async function productPrintImage(ref?: string | null): Promise<string | undefined> {
  if (!ref?.trim()) return undefined;
  const context=requestContextKey();
  const url=productPrintImageUrl(ref.trim(),apiBaseUrl());
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),20_000);
  try {
    const response=await expoFetch(url,{credentials:'omit',redirect:'error',signal:controller.signal});
    if(!response.ok||!response.body)throw new Error('Ürün fotoğrafı alınamadı. Lütfen yeniden deneyin.');
    if(Number(response.headers.get('content-length')??0)>MAX_PRINT_IMAGE_BYTES)throw new Error('PDF fotoğrafı 2 MB sınırını aşıyor.');
    const mime=(response.headers.get('content-type')??'').split(';')[0]!.trim().toLowerCase();
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let total=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_PRINT_IMAGE_BYTES)throw new Error('PDF fotoğrafı 2 MB sınırını aşıyor.');chunks.push(value);}} finally {await reader.cancel().catch(()=>undefined);reader.releaseLock();}
    if(context!==requestContextKey())throw new Error('Çalışma alanı değişti. Ürünü yeniden açın.');
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return rasterDataImage(bytes,mime);
  } finally {clearTimeout(timeout);}
}
