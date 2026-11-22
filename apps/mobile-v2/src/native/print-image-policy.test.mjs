import test from 'node:test';import assert from 'node:assert/strict';
import { productPrintImageUrl,rasterDataImage } from './print-image-policy.ts';
const id='12345678-1234-1234-1234-123456789012',base='https://crm.example/api/v1';
test('product print images cannot escape the configured public media endpoint',()=>{
 assert.equal(productPrintImageUrl(`/products/media/${id}`,base),`${base}/products/media/${id}`);
 assert.equal(productPrintImageUrl(`/api/v1/products/media/${id}`,base),`${base}/products/media/${id}`);
 for(const ref of [`https://evil.example/products/media/${id}`,`/files/${id}`,`/products/media/${id}?token=private`,`/products/media/../../companies/${id}`,`//evil.example/${id}`])assert.throws(()=>productPrintImageUrl(ref,base));
});
test('raster content MIME and signature must match before embedding',()=>{
 const png=new Uint8Array([137,80,78,71,13,10,26,10]);assert.equal(rasterDataImage(png,'image/png'),'data:image/png;base64,iVBORw0KGgo=');
 assert.throws(()=>rasterDataImage(png,'image/jpeg'));assert.throws(()=>rasterDataImage(new TextEncoder().encode('<svg/>'),'image/png'));
});
