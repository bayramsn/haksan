import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  activityService,
  companyService,
  opportunityService,
  quoteService,
} from '@/src/api/services';
import { useAuth } from '@/src/auth/AuthProvider';
import { CompanyPicker } from '@/src/ui/CompanyPicker';
import { ContactPicker } from '@/src/ui/ContactPicker';
import { OpportunityPicker } from '@/src/ui/OpportunityPicker';
import { PriceListPicker } from '@/src/ui/PriceListPicker';
import {
  CURRENCY_OPTIONS,
  DELIVERY_TERM_OPTIONS,
  formatOfferMoney,
  lineDiscount,
  lineSubtotal,
  lineVat,
  newOfferLine,
  OfferAddLineButton,
  OfferCatalogButton,
  OfferCompanyBar,
  OfferField,
  OfferFormFooter,
  OfferFormHeader,
  OfferLineCard,
  OfferPreviewPanel,
  OfferSectionTitle,
  OfferSelectField,
  OfferStepper,
  OfferStickyTotals,
  OfferTotalsPanel,
  parseAmount,
  VALIDITY_OPTIONS,
  type OfferLine,
} from '@/src/ui/offer/OfferFormWidgets';
import { Screen } from '@/src/ui/Screen';
import { colors, fonts, layout, spacing, typography } from '@/src/theme/tokens';

function buildLineDescription(line: OfferLine): string {
  const parts = [line.stockCode?.trim(), line.description.trim()].filter(Boolean);
  return parts.join(' — ') || 'Ürün';
}

function parseLineDescription(desc: string): { stockCode: string; description: string } {
  const dashIdx = desc.indexOf(' — ');
  if (dashIdx > -1) {
    return { stockCode: desc.slice(0, dashIdx), description: desc.slice(dashIdx + 3) };
  }
  return { stockCode: '', description: desc };
}

/** Stitch Yeni Teklif — web QuoteDialog + API `createQuoteFull` ile uyumlu sihirbaz */
export function OfferFormScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    companyId: initialCompanyId,
    opportunityId: initialOpportunityId,
    offerId: editOfferId,
    revisionFrom,
  } = useLocalSearchParams<{
    companyId?: string;
    opportunityId?: string;
    offerId?: string;
    revisionFrom?: string;
  }>();

  const editing = Boolean(editOfferId);
  const revising = Boolean(revisionFrom) && !editing;
  const canPickDivision = Boolean(user?.roles.includes('super_admin') && user?.canViewAllDivisions);
  const divisions = user?.divisions ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const [step, setStep] = useState(initialCompanyId || initialOpportunityId ? 1 : 0);
  const [companyId, setCompanyId] = useState(initialCompanyId ?? '');
  const [companyName, setCompanyName] = useState('');
  const [contactId, setContactId] = useState('');
  const [contactName, setContactName] = useState('');
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(initialOpportunityId ?? '');
  const [opportunityLabel, setOpportunityLabel] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [quoteDate, setQuoteDate] = useState(today);
  const [caseTitle, setCaseTitle] = useState('');
  const [validityDays, setValidityDays] = useState('30');
  const [currency, setCurrency] = useState('USD');
  const [lines, setLines] = useState<OfferLine[]>([newOfferLine()]);
  const [deliveryCode, setDeliveryCode] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [warrantyTerms, setWarrantyTerms] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [companyPickerKey, setCompanyPickerKey] = useState(0);
  const [prefillLoading, setPrefillLoading] = useState(
    Boolean(initialCompanyId || initialOpportunityId || editOfferId || revisionFrom),
  );
  const [revisionSourceLabel, setRevisionSourceLabel] = useState('');

  useEffect(() => {
    if (!user || !canPickDivision || divisionId) return;
    const primary = user.divisions.find((d) => d.isPrimary)?.id ?? user.divisions[0]?.id;
    if (primary) setDivisionId(primary);
  }, [user, canPickDivision, divisionId]);

  useEffect(() => {
    let cancelled = false;
    async function prefill() {
      try {
        if (initialOpportunityId) {
          const opp = await opportunityService.get(initialOpportunityId);
          if (cancelled) return;
          setSelectedOpportunityId(String(opp.id ?? initialOpportunityId));
          setOpportunityLabel(String(opp.title ?? opp.requestedProduct ?? ''));
          setCaseTitle(String(opp.title ?? ''));
          if (opp.currencyCode) setCurrency(String(opp.currencyCode));
          const cid = String(opp.companyId ?? '');
          if (cid) {
            setCompanyId(cid);
            const company = await companyService.get(cid);
            if (!cancelled) {
              setCompanyName(String(company.legalTitle ?? company.shortName ?? ''));
            }
          }
        } else if (initialCompanyId) {
          setCompanyId(initialCompanyId);
          const company = await companyService.get(initialCompanyId);
          if (!cancelled) {
            setCompanyName(String(company.legalTitle ?? company.shortName ?? ''));
          }
        }
      } catch {
        // Prefill isteğe bağlı; kullanıcı manuel seçebilir
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    }
    void prefill();
    return () => {
      cancelled = true;
    };
  }, [initialCompanyId, initialOpportunityId]);

  useEffect(() => {
    const sourceId = editOfferId || revisionFrom;
    if (!sourceId) return;
    let cancelled = false;

    async function loadQuote() {
      setPrefillLoading(true);
      try {
        const data = (await quoteService.get(sourceId!)) as Record<string, unknown>;
        if (cancelled) return;

        if (revising) {
          const revNo = Number(data.revisionNo ?? data.revision ?? 1);
          setRevisionSourceLabel(
            `Kaynak: ${String(data.documentNo ?? '—')} · Rev. R${revNo} → yeni revizyon`,
          );
          setDocumentNo('');
        }

        const cid = String(data.companyId ?? '');
        setCompanyId(cid);
        if (cid) {
          const company = await companyService.get(cid);
          if (!cancelled) {
            setCompanyName(String(company.legalTitle ?? company.shortName ?? ''));
          }
        }

        setContactId(String(data.contactId ?? ''));
        const contact = data.contact as Record<string, unknown> | undefined;
        if (contact) {
          setContactName(String(contact.fullName ?? [contact.firstName, contact.lastName].filter(Boolean).join(' ')));
        }

        const oppId = String(data.opportunityId ?? '');
        setSelectedOpportunityId(oppId);
        if (oppId) {
          try {
            const opp = await opportunityService.get(oppId);
            setOpportunityLabel(String(opp.title ?? opp.requestedProduct ?? ''));
            setCaseTitle(String(opp.title ?? ''));
          } catch {
            // opsiyonel
          }
        }

        setQuoteDate(today);
        setValidityDays(String(data.validityDays ?? '30'));
        if (!revising) setDocumentNo(String(data.documentNo ?? ''));
        setCurrency(String((data.currency as { code?: string } | undefined)?.code ?? data.currencyCode ?? 'USD'));
        setNotes(String(data.notes ?? ''));

        const terms = (data.terms as Record<string, unknown> | undefined) ?? {};
        setPaymentTerms(String(data.paymentTerms ?? terms.paymentTermsText ?? ''));
        setDeliveryTerms(String(data.deliveryTerms ?? terms.deliveryTermsText ?? ''));
        setWarrantyTerms(String(data.warrantyTerms ?? terms.warrantyTermsText ?? ''));

        const rawItems = (Array.isArray(data.items) ? data.items : []) as Record<string, unknown>[];
        const mapped = rawItems
          .filter((it) => !String(it.description ?? '').startsWith('↳ Opsiyon:'))
          .map((it) => {
            const parsed = parseLineDescription(String(it.description ?? ''));
            return {
              ...newOfferLine(),
              id: String(it.id ?? Math.random().toString(36).slice(2)),
              productModelId: it.productModelId ? String(it.productModelId) : undefined,
              stockCode: parsed.stockCode,
              description: parsed.description,
              quantity: String(it.quantity ?? '1'),
              unitCode: String((it.unit as { code?: string } | undefined)?.code ?? it.unitCode ?? 'adet'),
              unitPrice: String(it.unitPrice ?? ''),
              discountAmount: String(it.discountAmount ?? '0'),
              vatRate: String(it.vatRate ?? '20'),
            } satisfies OfferLine;
          });

        setLines(mapped.length ? mapped : [newOfferLine()]);
        setStep(1);
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Yüklenemedi', e instanceof Error ? e.message : 'Teklif okunamadı');
          router.back();
        }
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    }

    void loadQuote();
    return () => {
      cancelled = true;
    };
  }, [editOfferId, revisionFrom, revising, today]);

  const totals = useMemo(() => {
    const discountTotal = lines.reduce((s, l) => s + lineDiscount(l), 0);
    const subtotal = lines.reduce((s, l) => s + lineSubtotal(l), 0);
    const vatTotal = lines.reduce((s, l) => s + lineVat(l), 0);
    return { discountTotal, subtotal, vatTotal, grandTotal: subtotal + vatTotal };
  }, [lines]);

  const updateLine = (id: string, patch: Partial<OfferLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const validLines = lines.filter(
    (l) => (l.description.trim() || l.productModelId) && parseAmount(l.quantity) > 0,
  );

  const resetCompanyRelations = () => {
    setContactId('');
    setContactName('');
    if (!initialOpportunityId) {
      setSelectedOpportunityId('');
      setOpportunityLabel('');
      setCaseTitle('');
    }
  };

  const goBack = () => {
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  const goNext = () => {
    if (step === 0) {
      if (!companyId) {
        Alert.alert('Firma gerekli', 'Devam etmek için firma seçin.');
        return;
      }
      if (canPickDivision && !divisionId) {
        Alert.alert('Bölüm gerekli', 'Teklifi CNC / Üniversal / Sac bölümlerinden birine atayın.');
        return;
      }
      setStep(1);
      return;
    }
    if (step === 1) {
      if (Number(validityDays) < 1) {
        Alert.alert('Geçerlilik gerekli', 'Geçerlilik süresini girin.');
        return;
      }
      if (!validLines.length) {
        Alert.alert('Kalem gerekli', 'En az bir ürün satırı ekleyin.');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
    }
  };

  const submit = async () => {
    if (!companyId || !validLines.length) return;
    setLoading(true);
    try {
      const preset = DELIVERY_TERM_OPTIONS.find((d) => d.code === deliveryCode);

      if (editing && editOfferId) {
        await quoteService.update(editOfferId, {
          companyId,
          contactId: contactId || undefined,
          opportunityId: selectedOpportunityId || undefined,
          quoteDate: new Date(quoteDate),
          validityDays: Number(validityDays),
          documentNo: documentNo.trim() || undefined,
          currencyCode: currency,
          projectOwnerUserId: user?.id,
          notes: notes.trim() || undefined,
          paymentTerms: paymentTerms.trim() || undefined,
          deliveryTerms: deliveryTerms.trim() || undefined,
          warrantyTerms: warrantyTerms.trim() || undefined,
          divisionId: canPickDivision ? divisionId || undefined : undefined,
        });

        await quoteService.terms(editOfferId, {
          paymentTermsText: paymentTerms.trim() || undefined,
          deliveryTermsText: deliveryTerms.trim() || undefined,
          warrantyTermsText: warrantyTerms.trim() || undefined,
          importCostsExcluded: preset?.importCostsExcluded ?? true,
        });

        const existing = (await quoteService.get(editOfferId)) as Record<string, unknown>;
        const existingItems = (Array.isArray(existing.items) ? existing.items : []) as Record<string, unknown>[];
        for (const it of existingItems) {
          if (it.id) await quoteService.deleteItem(editOfferId, String(it.id));
        }

        for (let i = 0; i < validLines.length; i++) {
          const l = validLines[i];
          await quoteService.addItem(editOfferId, {
            productModelId: l.productModelId || undefined,
            description: buildLineDescription(l),
            quantity: parseAmount(l.quantity) || 1,
            unitCode: l.unitCode || 'adet',
            unitPrice: parseAmount(l.unitPrice),
            discountAmount: parseAmount(l.discountAmount),
            vatRate: parseAmount(l.vatRate),
            sortOrder: i,
          });
        }

        const docNo = documentNo.trim() || String(existing.documentNo ?? '');
        Alert.alert('Güncellendi', `Teklif kaydedildi${docNo ? `: ${docNo}` : ''}`, [
          { text: 'Detay', onPress: () => router.replace(`/modules/offers/${editOfferId}`) },
          { text: 'Tamam', onPress: () => router.back() },
        ]);
        return;
      }

      let oppId = selectedOpportunityId || undefined;
      let createdNewCase = false;

      if (!oppId) {
        const estimated = validLines.reduce((s, l) => s + lineSubtotal(l), 0);
        const opp = await opportunityService.create({
          companyId,
          title:
            caseTitle.trim() ||
            validLines[0].description.trim().slice(0, 80) ||
            'Yeni Teklif',
          estimatedValue: estimated,
          currencyCode: currency,
          probability: 50,
          divisionId: canPickDivision ? divisionId || undefined : undefined,
        });
        oppId = String((opp as { id: string }).id);
        createdNewCase = true;
      }

      const quote = await quoteService.create({
        opportunityId: oppId,
        companyId,
        contactId: contactId || undefined,
        quoteDate: new Date(quoteDate),
        validityDays: Number(validityDays),
        documentNo: documentNo.trim() || undefined,
        currencyCode: currency,
        projectOwnerUserId: user?.id,
        notes: notes.trim() || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        deliveryTerms: deliveryTerms.trim() || undefined,
        warrantyTerms: warrantyTerms.trim() || undefined,
        divisionId: canPickDivision ? divisionId || undefined : undefined,
      });

      const quoteId = String((quote as { id: string; documentNo?: string }).id);
      const docNo = String((quote as { documentNo?: string }).documentNo ?? documentNo);

      for (let i = 0; i < validLines.length; i++) {
        const l = validLines[i];
        await quoteService.addItem(quoteId, {
          productModelId: l.productModelId || undefined,
          description: buildLineDescription(l),
          quantity: parseAmount(l.quantity) || 1,
          unitCode: l.unitCode || 'adet',
          unitPrice: parseAmount(l.unitPrice),
          discountAmount: parseAmount(l.discountAmount),
          vatRate: parseAmount(l.vatRate),
          sortOrder: i,
        });
      }

      if (paymentTerms.trim() || deliveryTerms.trim() || warrantyTerms.trim() || deliveryCode) {
        await quoteService.terms(quoteId, {
          paymentTermsText: paymentTerms.trim() || undefined,
          deliveryTermsText: deliveryTerms.trim() || undefined,
          warrantyTermsText: warrantyTerms.trim() || undefined,
          importCostsExcluded: preset?.importCostsExcluded ?? true,
        });
      }

      await activityService
        .create({
          opportunityId: oppId,
          companyId,
          activityTypeCode: 'note',
          subject: 'Teklif oluşturuldu',
          description: docNo,
          activityDate: new Date(today),
        })
        .catch(() => undefined);

      if (createdNewCase) {
        await opportunityService.changeStage(oppId, { toStage: 'quote' }).catch(() => undefined);
      }

      Alert.alert('Başarılı', `Teklif kaydedildi${docNo ? `: ${docNo}` : ''}`, [
        { text: 'Detay', onPress: () => router.replace(`/modules/offers/${quoteId}`) },
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Teklif oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  const footerNextLabel =
    step === 3
      ? editing
        ? 'Teklifi Güncelle'
        : revising
          ? 'Revizyon Oluştur'
          : 'Teklif Oluştur'
      : step === 0
        ? 'Sonraki: Kalemler'
        : step === 1
          ? 'Sonraki: Koşullar'
          : 'Sonraki: Önizleme';

  const divisionOptions = divisions.map((d) => ({ label: d.name, value: d.id }));

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <OfferFormHeader
        onCancel={() => router.back()}
        onSave={step === 3 ? () => void submit() : undefined}
        saveLabel={loading ? '…' : editing ? 'Güncelle' : 'Kaydet'}
        saving={loading}
        title={editing ? 'Teklifi Düzenle' : revising ? 'Yeni Revizyon' : 'Yeni Teklif'}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OfferStepper activeIndex={step} />

          {revisionSourceLabel ? (
            <View style={styles.revisionBanner}>
              <Text style={styles.revisionBannerText}>{revisionSourceLabel}</Text>
            </View>
          ) : null}

          {prefillLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : null}

          {step === 0 ? (
            <View style={styles.stepBlock}>
              <OfferSectionTitle title="Firma & İlişkiler" />
              <View style={styles.fieldsGap}>
                <CompanyPicker
                  key={companyPickerKey}
                  label="Firma *"
                  value={companyId}
                  displayName={companyName}
                  onSelect={(c) => {
                    setCompanyId(c.id);
                    setCompanyName(String(c.legalTitle ?? c.shortName ?? ''));
                    resetCompanyRelations();
                  }}
                />
                <ContactPicker
                  label="Kontak"
                  companyId={companyId}
                  companyName={companyName}
                  value={contactId}
                  displayName={contactName}
                  onSelect={(c) => {
                    setContactId(c?.id ?? '');
                    setContactName(
                      c?.fullName ??
                        [c?.firstName, c?.lastName].filter(Boolean).join(' ') ??
                        '',
                    );
                  }}
                />
                <OpportunityPicker
                  label="Satış Kartı"
                  companyId={companyId}
                  value={selectedOpportunityId}
                  displayName={opportunityLabel}
                  onSelect={(o) => {
                    setSelectedOpportunityId(o?.id ?? '');
                    setOpportunityLabel(o?.title ?? o?.requestedProduct ?? '');
                    if (o?.title) setCaseTitle(o.title);
                  }}
                />
                <OfferField
                  label="Teklif Tarihi"
                  value={quoteDate}
                  onChangeText={setQuoteDate}
                  placeholder="YYYY-MM-DD"
                />
                {canPickDivision && divisionOptions.length > 0 ? (
                  <OfferSelectField
                    label="Bölüm *"
                    value={divisionId}
                    options={divisionOptions}
                    onChange={setDivisionId}
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          {step >= 1 && companyId ? (
            <OfferCompanyBar
              companyName={companyName || 'Seçili firma'}
              onChange={() => {
                setStep(0);
                setCompanyPickerKey((k) => k + 1);
              }}
            />
          ) : null}

          {step === 1 ? (
            <>
              <View style={styles.stepBlock}>
                <OfferSectionTitle title="Teklif Bilgileri" />
                <View style={styles.fieldsGap}>
                  {!selectedOpportunityId ? (
                    <OfferField
                      label="Başlık"
                      value={caseTitle}
                      onChangeText={setCaseTitle}
                      placeholder="CNC Torna Satışı"
                    />
                  ) : null}
                  <View style={styles.rowFields}>
                    <View style={styles.flexField}>
                      <OfferSelectField
                        label="Geçerlilik *"
                        value={validityDays}
                        options={VALIDITY_OPTIONS.map((o) => ({ label: o.label, value: String(o.value) }))}
                        onChange={setValidityDays}
                      />
                    </View>
                    <View style={styles.currencyCol}>
                      <OfferSelectField
                        label="Para Birimi"
                        value={currency}
                        options={CURRENCY_OPTIONS.map((o) => ({ label: o.label, value: o.code }))}
                        onChange={setCurrency}
                      />
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.stepBlock}>
                <View style={styles.linesHeader}>
                  <OfferSectionTitle title="Kalemler" />
                  <OfferCatalogButton onPress={() => setPriceOpen(true)} />
                </View>
                <View style={styles.linesGap}>
                  {lines.map((line) => (
                    <OfferLineCard
                      key={line.id}
                      line={line}
                      currencyCode={currency}
                      onChange={(patch) => updateLine(line.id, patch)}
                      onRemove={() => setLines((p) => p.filter((l) => l.id !== line.id))}
                      canRemove={lines.length > 1}
                    />
                  ))}
                  <OfferAddLineButton onPress={() => setLines((p) => [...p, newOfferLine()])} />
                </View>
              </View>

              <OfferTotalsPanel
                subtotal={totals.subtotal}
                discountTotal={totals.discountTotal}
                vatTotal={totals.vatTotal}
                grandTotal={totals.grandTotal}
                currencyCode={currency}
              />
            </>
          ) : null}

          {step === 2 ? (
            <View style={styles.stepBlock}>
              <OfferSectionTitle title="Koşullar & Notlar" />
              <View style={styles.fieldsGap}>
                <OfferSelectField
                  label="Teslim Şekli"
                  value={deliveryCode}
                  options={DELIVERY_TERM_OPTIONS.map((o) => ({ label: o.label, value: o.code }))}
                  onChange={(code) => {
                    setDeliveryCode(code);
                    const preset = DELIVERY_TERM_OPTIONS.find((d) => d.code === code);
                    if (preset?.label && preset.code) {
                      setDeliveryTerms(preset.label);
                    }
                  }}
                />
                <OfferField
                  label="Ödeme Şartları"
                  value={paymentTerms}
                  onChangeText={setPaymentTerms}
                  placeholder="Bu teklife ait ödeme şartlarını girin…"
                  multiline
                  style={styles.termsInput}
                />
                <OfferField
                  label="Teslimat Şartları"
                  value={deliveryTerms}
                  onChangeText={setDeliveryTerms}
                  placeholder="Bu teklife ait teslimat şartlarını girin…"
                  multiline
                  style={styles.termsInput}
                />
                <OfferField
                  label="Garanti Şartları"
                  value={warrantyTerms}
                  onChangeText={setWarrantyTerms}
                  placeholder="Bu teklife ait garanti şartlarını girin…"
                  multiline
                  style={styles.termsInput}
                />
                <OfferField
                  label="Teklif No (opsiyonel)"
                  value={documentNo}
                  onChangeText={setDocumentNo}
                  placeholder="Otomatik oluşturulur"
                />
                <OfferField
                  label="Notlar"
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Ek notlar…"
                  multiline
                  style={styles.notesInput}
                />
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.stepBlock}>
              <OfferSectionTitle title="Önizleme" />
              <OfferPreviewPanel
                companyName={companyName}
                contactName={contactName || undefined}
                quoteDate={quoteDate}
                validityDays={validityDays}
                currency={currency}
                opportunityLabel={opportunityLabel}
                selectedOpportunityId={selectedOpportunityId}
                caseTitle={caseTitle}
                lines={lines}
                paymentTerms={paymentTerms}
                deliveryTerms={deliveryTerms}
                warrantyTerms={warrantyTerms}
                notes={notes}
                buildDescription={buildLineDescription}
              />
              <OfferTotalsPanel
                subtotal={totals.subtotal}
                discountTotal={totals.discountTotal}
                vatTotal={totals.vatTotal}
                grandTotal={totals.grandTotal}
                currencyCode={currency}
              />
              {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {step === 1 || step === 3 ? (
        <OfferStickyTotals
          subtotal={totals.subtotal}
          discountTotal={totals.discountTotal}
          vatTotal={totals.vatTotal}
          grandTotal={totals.grandTotal}
          currencyCode={currency}
        />
      ) : null}

      <OfferFormFooter
        onBack={step > 0 ? goBack : undefined}
        nextLabel={footerNextLabel}
        onNext={step === 3 ? () => void submit() : goNext}
        nextDisabled={loading || prefillLoading}
      />

      <PriceListPicker
        visible={priceOpen}
        onClose={() => setPriceOpen(false)}
        onPick={(item) => {
          const name = String(item.description ?? item.productName ?? '');
          setLines((prev) => [
            ...prev,
            {
              ...newOfferLine(),
              productModelId: item.productModelId,
              stockCode: item.stockCode ?? '',
              description: name,
              unitPrice: String(item.unitPrice ?? item.listPrice ?? ''),
              vatRate: item.vatRate != null ? String(item.vatRate) : '20',
            },
          ]);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
  },
  stepBlock: { marginBottom: spacing.lg },
  fieldsGap: { gap: spacing.sm },
  rowFields: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  flexField: { flex: 1, minWidth: 0 },
  currencyCol: { width: 112, flexShrink: 0 },
  linesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  linesGap: { gap: spacing.sm },
  termsInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: spacing.md },
  notesInput: { minHeight: 100, textAlignVertical: 'top', paddingTop: spacing.md },
  loader: { marginTop: spacing.lg },
  revisionBanner: {
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  revisionBannerText: { ...typography.bodySm, color: colors.primary, fontFamily: fonts.semibold },
});
