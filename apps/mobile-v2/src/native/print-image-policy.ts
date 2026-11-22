const MAX_PRINT_IMAGE_BYTES=2*1024*1024;
export { MAX_PRINT_IMAGE_BYTES };
export function productPrintImageUrl(ref: string, apiBase: string): string {
  const base=new URL(apiBase.endsWith('/')?apiBase:`${apiBase}/`);
  const url=new URL(ref.startsWith('/api/')?ref:ref.replace(/^\//,''),ref.startsWith('/api/')?base.origin:base);
  const prefix=base.pathname.replace(/\/$/,'');
  if (url.origin!==base.origin || url.username || url.password || url.search || url.hash || !new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}/products/media/[0-9a-f-]{36}$`,'i').test(url.pathname)) throw new Error('Ürün görseli güvenilir CRM medya adresinde değil.');
  return url.toString();
}
export function rasterDataImage(bytes: Uint8Array, mime: string): string {
  const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if (!bytes.length||bytes.length>MAX_PRINT_IMAGE_BYTES||!((mime==='image/png'&&png)||(mime==='image/jpeg'&&jpeg)||(mime==='image/webp'&&webp))) throw new Error('Ürün görseli desteklenmeyen veya geçersiz bir dosya.');
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let value='';
  for(let i=0;i<bytes.length;i+=3){const a=bytes[i]!,b=bytes[i+1],c=bytes[i+2];value+=alphabet[a>>2]!+alphabet[((a&3)<<4)|((b??0)>>4)]!+(b===undefined?'=':alphabet[((b&15)<<2)|((c??0)>>6)])+(c===undefined?'=':alphabet[c&63]);}
  return `data:${mime};base64,${value}`;
}
