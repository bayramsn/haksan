import { z } from 'zod';
import { moneySchema } from './common';

export const receivableCreateSchema = z.object({
  companyId: z.string().min(1),
  quoteId: z.string().optional(),
  amount: moneySchema,
  currencyCode: z.string().max(8).default('USD'),
  dueDate: z.coerce.date(),
  notes: z.string().max(2000).optional(),
});
export type ReceivableCreateInput = z.infer<typeof receivableCreateSchema>;

export const paymentCreateSchema = z
  .object({
    // Kasa yönü: 'in' = giren (tahsilat), 'out' = çıkan (tedarikçi/gider ödemesi).
    direction: z.enum(['in', 'out']).default('in'),
    // Giriş ödemeleri bir alacağa (receivable) bağlanabilir; çıkış ödemelerinin
    // alacağı olmaz, bunun yerine doğrudan companyId verilir.
    receivableId: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    amount: moneySchema,
    currencyCode: z.string().max(8).default('USD'),
    paymentDate: z.coerce.date(),
    paymentMethod: z.enum(['bank_transfer', 'cash', 'credit_card', 'check', 'other']).default('bank_transfer'),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => !!v.receivableId || !!v.companyId, {
    message: 'receivableId veya companyId zorunludur',
    path: ['companyId'],
  });
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
