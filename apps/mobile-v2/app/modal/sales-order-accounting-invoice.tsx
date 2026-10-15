import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCreateAccountingInvoice } from '@/src/api/commercial-docs.hooks';
import { useLookup } from '@/src/api/crm.hooks';
import { useSalesOrder } from '@/src/api/inventory.hooks';
import { useQuoteDetail } from '@/src/api/quotes.hooks';
import { useCan } from '@/src/auth/AuthProvider';
import { formatAmount } from '@/src/lib/format';
import { Card, DetailSkeleton, ErrorState, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { invoicePrefill, invoiceTotals } from '@/src/ui/documents/document-logic';
import { ChoiceChips, ModalForm, TotalLine } from '@/src/ui/documents/pickers';
import { formatDay, parseDay, parseDecimal } from '@/src/ui/documents/quote-logic';
import { DateTextField } from '@/src/ui/select/DateTextField';

type PaymentType = 'cash' | 'term' | 'leasing';

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: 'cash', label: 'Peşin' },
  { value: 'term', label: 'Vadeli' },
  { value: 'leasing', label: 'Leasing' },
];

/**
 * Satış siparişinden veya onaylı tekliften muhasebe (satış) faturası —
 * web OffersPage "Muhasebe Faturası" (CreateAccountingInvoiceDialog + invoicePrefillFromOrder).
 */
export default function SalesOrderAccountingInvoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; quoteId?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId : '';
  const canCreate = useCan('accounting_invoices.create');
  const order = useSalesOrder(orderId);
  const quoteId = (typeof params.quoteId === 'string' && params.quoteId) || order.data?.quoteId || '';
  const quote = useQuoteDetail(quoteId);
  const currencies = useLookup('currencies');
  const create = useCreateAccountingInvoice();

  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(formatDay(new Date()));
  const [amount, setAmount] = useState('');
  const [vatRate, setVatRate] = useState('20');
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [termDays, setTermDays] = useState('');
  const [notes, setNotes] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const orderReady = !orderId || Boolean(order.data);
  const quoteReady = !quoteId || Boolean(quote.data);
  const prefill = orderReady && quoteReady ? invoicePrefill({ order: order.data ?? null, quote: quote.data ?? null }) : null;
  const currencyId = order.data?.currencyId ?? quote.data?.currencyId;
  const currencyCode = currencies.data?.find((c) => c.id === currencyId)?.code ?? 'USD';

  useEffect(() => {
    if (hydrated || !prefill) return;
    setInvoiceNo(prefill.invoiceNo.slice(0, 64));
    setAmount(String(prefill.amount));
    setVatRate(String(prefill.vatRate));
    setNotes(prefill.notes);
    setHydrated(true);
  }, [hydrated, prefill]);

  if (!canCreate || (!orderId && !quoteId)) return <Redirect href="/(tabs)/modules/sales-orders" />;

  const loadError = order.error ?? quote.error;
  const net = parseDecimal(amount);
  const rate = parseDecimal(vatRate);
  const totals = Number.isFinite(net) && Number.isFinite(rate) ? invoiceTotals(net, rate) : null;

  function submit() {
    if (!prefill) return;
    if (!invoiceNo.trim()) return toast.error('Fatura no zorunlu');
    const day = parseDay(invoiceDate);
    if (!day) return toast.error('Tarih biçimi: YYYY-AA-GG');
    if (!(net > 0) || !totals) return toast.error('Matrah sıfırdan büyük olmalı');
    if (!(rate >= 0 && rate <= 100)) return toast.error('KDV oranı 0–100 arası olmalı');
    let paymentTermDays: number | undefined;
    if (paymentType === 'term') {
      paymentTermDays = Number(termDays.trim());
      if (!termDays.trim() || !Number.isInteger(paymentTermDays) || paymentTermDays < 0 || paymentTermDays > 3650) {
        return toast.error('Vade günü 0–3650 arası olmalı');
      }
    }
    create.mutate(
      {
        companyId: prefill.companyId,
        type: 'sales',
        invoiceNo: invoiceNo.trim(),
        invoiceDate: day.toISOString(),
        amount: net,
        vatRate: rate,
        vatAmount: totals.vatAmount,
        grandTotal: totals.grandTotal,
        currencyCode,
        paymentType,
        paymentTermDays,
        quoteId: prefill.quoteId,
        salesOrderId: prefill.salesOrderId,
        orderNo: prefill.orderNo,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (created) => {
          toast.success(`Muhasebe faturası oluşturuldu · ${created.invoiceNo}`);
          router.replace(`/(tabs)/modules/invoices/${created.id}`);
        },
        onError: (error) => toast.error(error.message),
      }
    );
  }

  return (
    <ModalForm title="Muhasebe Faturası" submitLabel="Faturayı Oluştur" onSubmit={submit} loading={create.isPending} disabled={!hydrated}>
      {loadError ? (
        <ErrorState
          message={loadError.message}
          onRetry={() => {
            void order.refetch();
            void quote.refetch();
          }}
        />
      ) : !hydrated ? (
        <DetailSkeleton />
      ) : (
        <View className="gap-4">
          <Text className="font-inter text-sm text-muted-foreground">
            {order.data
              ? `Satış siparişi ${order.data.orderNo} tutarlarıyla satış faturası kesilir.`
              : `Teklif ${quote.data?.documentNo ?? ''} tutarlarıyla satış faturası kesilir.`}
          </Text>
          <Field label="Fatura No *" value={invoiceNo} onChangeText={setInvoiceNo} maxLength={64} />
          <DateTextField
            label="Fatura Tarihi"
            value={invoiceDate}
            onChangeText={setInvoiceDate}
          />
          <View className="flex-row gap-2">
            <View className="flex-[1.6]">
              <Field label={`Matrah (${currencyCode})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            </View>
            <View className="flex-1">
              <Field label="KDV %" value={vatRate} onChangeText={setVatRate} keyboardType="decimal-pad" />
            </View>
          </View>
          <ChoiceChips label="Ödeme Tipi" options={PAYMENT_TYPES} value={paymentType} onChange={setPaymentType} />
          {paymentType === 'term' ? (
            <Field label="Vade (Gün)" value={termDays} onChangeText={setTermDays} keyboardType="number-pad" placeholder="Örn. 60" maxLength={4} />
          ) : null}
          <Field label="Notlar" value={notes} onChangeText={setNotes} maxLength={2000} multiline />
          {totals ? (
            <Card className="p-4">
              <TotalLine label="Matrah" value={formatAmount(net, currencyCode)} />
              <TotalLine label="KDV" value={formatAmount(totals.vatAmount, currencyCode)} />
              <TotalLine label="Genel Toplam" value={formatAmount(totals.grandTotal, currencyCode)} strong />
            </Card>
          ) : null}
        </View>
      )}
    </ModalForm>
  );
}
