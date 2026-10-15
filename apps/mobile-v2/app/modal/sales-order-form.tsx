import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useContactList, useLookup } from '@/src/api/crm.hooks';
import type { CompanyListItem } from '@/src/api/endpoints';
import { useSalesOrder } from '@/src/api/inventory.hooks';
import type { SalesOrderInput } from '@/src/api/sales-orders.api';
import { useCreateSalesOrder, useUpdateSalesOrder } from '@/src/api/sales-orders.hooks';
import { useAuth, useCan } from '@/src/auth/AuthProvider';
import { DetailSkeleton, ErrorState, Eyebrow, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { ChoiceChips, CompanyPickerSheet, ModalForm, PickerField } from '@/src/ui/documents/pickers';
import { formatDay, parseDay } from '@/src/ui/documents/quote-logic';
import { DateTextField } from '@/src/ui/select/DateTextField';

const CURRENCIES = ['USD', 'EUR', 'TRY'] as const;

/** Manuel satış siparişi (salesOrderCreateSchema); `?id=` ile başlık bilgilerini düzenler. */
export default function SalesOrderFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; companyId?: string }>();
  const orderId = typeof params.id === 'string' ? params.id : '';
  const isEdit = Boolean(orderId);
  const { user, scope } = useAuth();
  const canCreate = useCan('sales_orders.create');
  const canUpdate = useCan('sales_orders.update');
  const existing = useSalesOrder(orderId);
  const currencies = useLookup('currencies');
  const divisions = user?.divisions ?? [];

  const [companyId, setCompanyId] = useState(typeof params.companyId === 'string' ? params.companyId : '');
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [contactId, setContactId] = useState('');
  const [divisionId, setDivisionId] = useState(scope.divisionId ?? divisions.find((d) => d.isPrimary)?.id ?? divisions[0]?.id ?? '');
  const [orderNo, setOrderNo] = useState('');
  const [orderDate, setOrderDate] = useState(formatDay(new Date()));
  const [currencyCode, setCurrencyCode] = useState<string>('USD');
  const [notes, setNotes] = useState('');
  const [hydrated, setHydrated] = useState(!isEdit);
  const companySheet = useRef<BottomSheetModal>(null);
  const contacts = useContactList(
    useMemo(() => ({ companyId, sortBy: 'name' as const, sortDir: 'asc' as const }), [companyId]),
    Boolean(companyId)
  );
  const create = useCreateSalesOrder();
  const update = useUpdateSalesOrder();

  useEffect(() => {
    const order = existing.data;
    if (!isEdit || hydrated || !order || !currencies.data) return;
    setCompanyId(order.companyId);
    setContactId(order.contactId ?? '');
    setOrderNo(order.orderNo);
    setOrderDate(order.orderDate.slice(0, 10));
    setCurrencyCode(currencies.data.find((c) => c.id === order.currencyId)?.code ?? 'USD');
    setNotes(order.notes ?? '');
    setHydrated(true);
  }, [currencies.data, existing.data, hydrated, isEdit]);

  if (isEdit ? !canUpdate : !canCreate) return <Redirect href="/(tabs)/modules/sales-orders" />;

  function submit() {
    if (!companyId) return toast.error('Firma seçin');
    if (!isEdit && divisions.length > 0 && !divisionId) return toast.error('İş alanı seçin');
    const day = parseDay(orderDate);
    if (!day) return toast.error('Tarih biçimi: YYYY-AA-GG');
    const body: SalesOrderInput = {
      companyId,
      contactId: contactId || undefined,
      orderNo: orderNo.trim() || undefined,
      orderDate: day.toISOString(),
      currencyCode,
      notes: notes.trim() || undefined,
      ...(isEdit ? {} : { divisionId: divisionId || undefined }),
    };
    const fail = (error: Error) => toast.error(error.message);
    if (isEdit) {
      update.mutate(
        {
          id: orderId,
          body: { contactId: body.contactId, orderNo: body.orderNo, orderDate: body.orderDate, currencyCode, notes: body.notes },
        },
        {
          onSuccess: () => {
            toast.success('Satış siparişi güncellendi');
            router.back();
          },
          onError: fail,
        }
      );
      return;
    }
    create.mutate(body, {
      onSuccess: (created) => {
        toast.success('Satış siparişi oluşturuldu');
        router.replace(`/(tabs)/modules/sales-orders/${created.id}`);
      },
      onError: fail,
    });
  }

  const contactOptions = (contacts.data?.items ?? []).slice(0, 12);
  const loadError = isEdit ? existing.error : null;

  return (
    <>
      <ModalForm
        title={isEdit ? 'Satış Siparişini Düzenle' : 'Yeni Satış Siparişi'}
        submitLabel={isEdit ? 'Kaydet' : 'Sipariş Oluştur'}
        onSubmit={submit}
        loading={create.isPending || update.isPending}
        disabled={!hydrated}
      >
        {loadError ? (
          <ErrorState message={loadError.message} onRetry={() => void existing.refetch()} />
        ) : !hydrated ? (
          <DetailSkeleton />
        ) : (
          <>
            <View className="gap-3">
              <Eyebrow>Müşteri</Eyebrow>
              <PickerField
                label="Firma *"
                value={companyName ?? (companyId ? 'Seçili firma' : null)}
                placeholder="Firma seçin"
                icon="business-outline"
                onPress={() => companySheet.current?.present()}
                disabled={isEdit}
              />
              {companyId && contactOptions.length > 0 ? (
                <ChoiceChips
                  label="Kontak"
                  options={[{ value: '', label: 'Seçilmedi' }, ...contactOptions.map((contact) => ({ value: contact.id, label: contact.fullName }))]}
                  value={contactId}
                  onChange={setContactId}
                />
              ) : null}
            </View>
            <View className="gap-3">
              <Eyebrow>Sipariş</Eyebrow>
              {!isEdit && divisions.length > 0 ? (
                <ChoiceChips
                  label="İş Alanı *"
                  options={divisions.map((division) => ({ value: division.id, label: division.name }))}
                  value={divisionId || null}
                  onChange={setDivisionId}
                />
              ) : null}
              <Field label="Sipariş No" value={orderNo} onChangeText={setOrderNo} placeholder="Otomatik" maxLength={64} />
              <DateTextField
                label="Sipariş Tarihi"
                value={orderDate}
                onChangeText={setOrderDate}
              />
              <ChoiceChips label="Para Birimi" options={CURRENCIES.map((code) => ({ value: code, label: code }))} value={currencyCode} onChange={setCurrencyCode} />
              <Field label="Notlar" value={notes} onChangeText={setNotes} maxLength={4000} multiline />
            </View>
          </>
        )}
      </ModalForm>
      <CompanyPickerSheet
        sheetRef={companySheet}
        selectedId={companyId}
        onSelect={(company: CompanyListItem) => {
          setCompanyId(company.id);
          setCompanyName(company.shortName ?? company.legalTitle);
          setContactId('');
        }}
      />
    </>
  );
}
