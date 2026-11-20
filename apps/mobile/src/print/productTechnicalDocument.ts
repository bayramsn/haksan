import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { productService } from '../api/services';
import { apiBaseOrigin } from '../api/config';
import { inlinePrintImages } from './inlinePrintImages';
import { productTechnicalHtml } from './productTechnicalDocumentData';

export async function shareProductTechnicalDocument(productId: string): Promise<void> {
  if (!productId) throw new Error('Ürün seçilmedi.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Bu cihazda PDF paylaşımı kullanılamıyor.');
  const product = await productService.get(productId);
  const [specs, equipment, compatible] = await Promise.all([
    productService.specs(productId), productService.equipment(productId),
    product.category?.code === 'TEZGAH' ? productService.compatibleOptionalEquipment(productId) : Promise.resolve([]),
  ]);
  const html = await inlinePrintImages(productTechnicalHtml(product, specs, equipment, compatible, apiBaseOrigin()));
  const file = await Print.printToFileAsync({ html, width: 595.28, height: 841.89 });
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Ürün Teknik Bilgileri PDF' });
}
