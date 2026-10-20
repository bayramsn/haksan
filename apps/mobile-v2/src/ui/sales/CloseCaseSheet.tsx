import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useSetQualificationStage } from '@/src/api/crm.hooks';
import { useChangeOpportunityStage } from '@/src/api/sales.hooks';
import { Button, Field } from '@/src/ui';
import { toast } from '@/src/ui/toast';
import { LostCaseFields } from '@/src/ui/sales/LostCaseFields';
import { PillGroup, SalesSheet, SheetOption } from '@/src/ui/sales/Sheet';
import {
  CANCEL_REASONS,
  EMPTY_LOST_INPUT,
  LOST_REASONS,
  cancelStageBody,
  lostStageBody,
  validateCloseCaseInput,
  type CloseOutcome,
  type LostInput,
} from '@/src/ui/sales/sales-logic';

export type CloseCaseSheetHandle = {
  present: (opts?: { productName?: string | null }) => void;
  dismiss: () => void;
};

/**
 * Web CloseCaseDialog karşılığı: önce İptal / Kaybedildi, sonra neden.
 * İptal → pipeline cancelled (kayıp analizine girmez);
 * Kaybedildi → qualification lost + zorunlu kayıp alanları.
 */
export const CloseCaseSheet = forwardRef<
  CloseCaseSheetHandle,
  { opportunityId: string; caseName?: string | null; onClosed?: () => void }
>(function CloseCaseSheet({ opportunityId, caseName, onClosed }, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const markLost = useSetQualificationStage();
  const cancelCase = useChangeOpportunityStage();
  const [outcome, setOutcome] = useState<CloseOutcome | ''>('');
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [lost, setLost] = useState<LostInput>(EMPTY_LOST_INPUT);
  const [error, setError] = useState<string | null>(null);
  const saving = markLost.isPending || cancelCase.isPending;

  useImperativeHandle(ref, () => ({
    present: (opts) => {
      setOutcome('');
      setReasonCode(null);
      setCancelNote('');
      setLost({ ...EMPTY_LOST_INPUT, productName: opts?.productName?.trim() ?? '' });
      setError(null);
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  function submit() {
    const invalid = validateCloseCaseInput({ outcome, reasonCode, cancelNote, lost });
    if (invalid) {
      setError(invalid);
      return;
    }
    if (outcome === 'cancelled') {
      cancelCase.mutate(
        { id: opportunityId, body: cancelStageBody({ reasonCode: reasonCode!, note: cancelNote }) },
        {
          onSuccess: () => {
            sheetRef.current?.dismiss();
            toast.success('Fırsat iptal edildi olarak kapatıldı');
            onClosed?.();
          },
          onError: (err) => setError(err.message),
        }
      );
      return;
    }
    markLost.mutate(
      {
        id: opportunityId,
        ...lostStageBody({ ...lost, reasonCode }),
      },
      {
        onSuccess: () => {
          sheetRef.current?.dismiss();
          toast.success('Fırsat kaybedildi olarak işaretlendi');
          onClosed?.();
        },
        onError: (err) => setError(err.message),
      }
    );
  }

  const reasons = outcome === 'lost' ? LOST_REASONS : CANCEL_REASONS;

  return (
    <SalesSheet
      ref={sheetRef}
      title="Fırsatı Kapat"
      subtitle={
        caseName
          ? `${caseName} · Kart silinmez; geçmişte kalır. İleri tarihli takip için “Takibe Al” kullanın.`
          : 'Kart silinmez; geçmişte kalır. İleri tarihli takip için “Takibe Al” kullanın.'
      }
    >
      <View className="gap-2">
        <Text className="font-inter-medium text-[13px] text-muted-foreground">Kapanış türü *</Text>
        <SheetOption
          label="İptal edildi"
          hint="Yatırım düştü, rakibe gitmedi"
          icon="ban-outline"
          selected={outcome === 'cancelled'}
          onPress={() => {
            setOutcome('cancelled');
            setReasonCode(null);
            setError(null);
          }}
        />
        <SheetOption
          label="Kaybedildi"
          hint="Rakip tercih edildi"
          icon="trophy-outline"
          tone="destructive"
          selected={outcome === 'lost'}
          onPress={() => {
            setOutcome('lost');
            setReasonCode(null);
            setError(null);
          }}
        />
      </View>

      {outcome ? (
        <PillGroup
          label={outcome === 'lost' ? 'Kaybetme Nedeni *' : 'İptal Nedeni *'}
          tone="destructive"
          options={reasons.map((r) => ({ value: r.code, label: r.name }))}
          value={reasonCode}
          onChange={(code) => {
            setReasonCode(code);
            setError(null);
          }}
        />
      ) : null}

      {outcome === 'cancelled' ? (
        <Field
          label="Açıklama"
          value={cancelNote}
          onChangeText={(text) => setCancelNote(text.slice(0, 1000))}
          placeholder="Müşterinin gerekçesi, tekrar görüşülecek tarih, not…"
          multiline
          numberOfLines={3}
          maxLength={1000}
        />
      ) : null}

      {outcome === 'lost' ? (
        <LostCaseFields
          hideReason
          value={lost}
          onChange={(next) => {
            setLost(next);
            setError(null);
          }}
          productPlaceholder={lost.productName || undefined}
        />
      ) : null}

      {error ? (
        <Text accessibilityRole="alert" className="font-inter text-xs text-destructive">
          {error}
        </Text>
      ) : null}

      {outcome ? (
        <Button
          label={outcome === 'lost' ? 'Kaybedildi İşaretle' : 'Fırsatı Kapat'}
          variant="destructive"
          loading={saving}
          disabled={saving}
          onPress={submit}
        />
      ) : null}
    </SalesSheet>
  );
});
