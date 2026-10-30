import { computeCustomsCharges, isMachiningCenterTypeCode } from '@haksan/shared';
import type { EditableQuoteItem, ParsedQuoteItem } from './quote-logic';
export function quoteTotalsPreview(rows: ParsedQuoteItem[], source: EditableQuoteItem[], header: { amount: number; percent: number }, usdToQuote: number | null) {
  const gross = rows.reduce((sum,row)=>sum+row.quantity*row.unitPrice,0);
  const lineDiscount = rows.reduce((sum,row)=>sum+row.discountAmount,0);
  const net = Math.max(0,gross-lineDiscount);
  const discount = Math.min(net,Math.max(0,header.percent>0?net*header.percent/100:header.amount));
  const ratio = net>0?(net-discount)/net:1;
  const vat = rows.reduce((sum,row)=>sum+Math.max(0,row.quantity*row.unitPrice-row.discountAmount)*ratio*row.vatRate/100,0);
  const nationalized = source.filter(row=>row.nationalized && isMachiningCenterTypeCode(row.productTypeCode));
  const customs = nationalized.length && usdToQuote===null ? null : nationalized.reduce((sum,row)=>{
    const parsed=rows.find(item=>item.compatibility?.lineGroupKey===row.lineGroupKey && !item.description.startsWith('↳'));
    return sum+(parsed?computeCustomsCharges({lineTotal:parsed.quantity*parsed.unitPrice,quantity:parsed.quantity,usdToQuoteRate:usdToQuote??1}).total:0);
  },0);
  return {gross,lineDiscount,headerDiscount:discount,vat,customs,grand:customs===null?null:net-discount+vat+customs};
}
