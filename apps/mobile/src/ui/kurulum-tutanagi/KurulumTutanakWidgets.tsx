import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { KurulumTutanakModel } from '@/src/ui/kurulum-tutanagi/kurulumTutanakModel';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard } from '@/src/theme/styles';

export function KurulumTutanakHeader({
  onBack,
  onDownload,
  onPrint,
  onShare,
}: {
  onBack: () => void;
  onDownload?: () => void;
  onPrint?: () => void;
  onShare?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }, shadowCard]}>
      <View style={styles.headerLeft}>
        <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
          <Ionicons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
        </Pressable>
        <Text style={styles.headerTitle}>Kurulum Tutanağı</Text>
      </View>
      <View style={styles.headerActions}>
        {onDownload ? (
          <Pressable onPress={onDownload} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
            <Ionicons name="download-outline" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
        {onPrint ? (
          <Pressable onPress={onPrint} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
            <Ionicons name="print-outline" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
        {onShare ? (
          <Pressable onPress={onShare} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
            <Ionicons name="share-outline" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function KurulumTutanakSubheader({ model }: { model: KurulumTutanakModel }) {
  const ready = model.status === 'ready';
  return (
    <View style={styles.subheader}>
      <Text style={styles.subtitle} numberOfLines={1}>
        {model.subtitle}
      </Text>
      <View style={[styles.badge, ready ? styles.badgeReady : styles.badgePending]}>
        <Text style={[styles.badgeText, ready ? styles.badgeTextReady : styles.badgeTextPending]}>
          {ready ? 'Hazır' : 'Bekliyor'}
        </Text>
      </View>
    </View>
  );
}

export function KurulumTutanakPaper({
  model,
  scale,
}: {
  model: KurulumTutanakModel;
  scale: number;
}) {
  return (
    <View style={[styles.paperWrap, { transform: [{ scale }] }]}>
      <View style={[styles.paper, shadowCard]}>
        <View style={styles.docHeader}>
          <View>
            <Text style={styles.brandTitle}>HAKSAN MAKİNA</Text>
            <Text style={styles.brandSub}>Endüstriyel Çözümler</Text>
          </View>
          <Text style={styles.formNoRight}>Form No: {model.formNo}</Text>
        </View>
        <Text style={styles.docTitle}>KURULUM TUTANAĞI</Text>
        <View style={styles.dateRow}>
          <Text style={styles.dateCell}>
            <Text style={styles.dateLabel}>TESLİM TARİHİ: </Text>
            {model.teslimTarihi}
          </Text>
          <Text style={[styles.dateCell, styles.dateCellRight]}>
            <Text style={styles.dateLabel}>KURULUM TARİHİ: </Text>
            {model.kurulumTarihi}
          </Text>
        </View>
        <FormSection title="TEZGAH BİLGİLERİ">
          <Grid2x2
            cells={[
              { label: 'Marka', value: model.tezgah.marka },
              { label: 'Tip', value: model.tezgah.tip },
              { label: 'Model', value: model.tezgah.model },
              { label: 'Seri No', value: model.tezgah.seriNo },
            ]}
          />
        </FormSection>
        <FormSection title="KONTROL ÜNİTESİ">
          <Grid2x2
            cells={[
              { label: 'Marka', value: model.cnc.marka },
              { label: 'Model', value: model.cnc.model },
              { label: 'Seri No', value: model.cnc.seriNo },
              { label: 'Main S/W', value: model.cnc.mainSw ?? '—' },
            ]}
          />
        </FormSection>
        <FormSection title="MÜŞTERİ BİLGİLERİ">
          <View style={styles.musteriRow}>
            <View style={styles.musteriHalf}>
              <FieldCell label="Firma" value={model.musteri.firma} />
            </View>
            <View style={styles.musteriHalf}>
              <FieldCell label="İlgili Kişi" value={model.musteri.ilgili} alignRight />
            </View>
          </View>
          <View style={[styles.cell, styles.cellBorderTop]}>
            <FieldCell label="Adres" value={model.musteri.adres} />
          </View>
        </FormSection>
        <FormSection title="KURULUM DETAYLARI">
          <View style={styles.kurulumRow}>
            <View style={[styles.kurulumCell, styles.cellBorderRight]}>
              <FieldCell label="Kurulumu Yapan" value={model.kurulum.yapan} />
            </View>
            <View style={styles.kurulumCell}>
              <FieldCell label="Süre" value={model.kurulum.sure} />
            </View>
          </View>
        </FormSection>
        <View style={styles.signatures}>
          <SignatureBlock title="Kurulumu Yapan" name={model.kurulum.yapan} />
          <SignatureBlock title="Müşteri Yetkilisi" name={model.signedBy !== '—' ? model.signedBy : ''} />
        </View>
      </View>
    </View>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Grid2x2({ cells }: { cells: { label: string; value: string }[] }) {
  return (
    <View style={styles.grid}>
      {cells.map((cell, i) => (
        <View
          key={cell.label}
          style={[
            styles.gridCell,
            i % 2 === 0 && styles.cellBorderRight,
            i < 2 && styles.cellBorderBottom,
          ]}
        >
          <FieldCell label={cell.label} value={cell.value} />
        </View>
      ))}
    </View>
  );
}

function FieldCell({
  label,
  value,
  alignRight,
}: {
  label: string;
  value: string;
  alignRight?: boolean;
}) {
  return (
    <View style={alignRight ? styles.alignRight : undefined}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function SignatureBlock({ title, name }: { title: string; name?: string }) {
  return (
    <View style={styles.sigBlock}>
      <Text style={styles.sigTitle}>{title}</Text>
      {name ? <Text style={styles.sigName}>{name}</Text> : null}
      <View style={styles.sigLine} />
      <Text style={styles.sigHint}>Tarih / İmza</Text>
    </View>
  );
}

export function KurulumTutanakZoomPill({
  zoom,
  onZoomIn,
  onZoomOut,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  return (
    <View style={[styles.zoomPill, shadowCard]}>
      <Pressable onPress={onZoomOut} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
        <Ionicons name="remove" size={20} color={colors.onSurfaceVariant} />
      </Pressable>
      <Text style={styles.zoomText}>{zoom}%</Text>
      <Pressable onPress={onZoomIn} hitSlop={8} style={({ pressed }) => pressFade(pressed)}>
        <Ionicons name="add" size={20} color={colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

export function KurulumTutanakFooter({
  onPdf,
  onEmail,
}: {
  onPdf: () => void;
  onEmail: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }, shadowCard]}>
      <Pressable onPress={onPdf} style={({ pressed }) => [styles.btnPrimary, pressFade(pressed)]}>
        <Ionicons name="download-outline" size={20} color="#fff" />
        <Text style={styles.btnPrimaryText}>PDF İndir</Text>
      </Pressable>
      <Pressable onPress={onEmail} style={({ pressed }) => [styles.btnSecondary, pressFade(pressed)]}>
        <Ionicons name="mail-outline" size={20} color={colors.primary} />
        <Text style={styles.btnSecondaryText}>E-posta Gönder</Text>
      </Pressable>
    </View>
  );
}

export function KurulumTutanakScroll({
  model,
  zoom,
  onZoomIn,
  onZoomOut,
}: {
  model: KurulumTutanakModel;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const scale = zoom / 100;
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator
    >
      <KurulumTutanakPaper model={model} scale={scale} />
      <View style={styles.zoomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  headerTitle: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  subheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.containerMargin,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    gap: spacing.sm,
  },
  subtitle: { ...typography.label, color: colors.onSurfaceVariant, flex: 1, fontFamily: fonts.medium },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  badgeReady: { backgroundColor: '#d1fae5' },
  badgePending: { backgroundColor: '#fef3c7' },
  badgeText: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeTextReady: { color: '#059669' },
  badgeTextPending: { color: '#b45309' },
  scroll: { flex: 1, backgroundColor: colors.surfaceContainerLow },
  scrollContent: {
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.lg,
    paddingBottom: 180,
    alignItems: 'center',
  },
  paperWrap: { width: '100%', maxWidth: 350 },
  paper: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 480,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
  },
  brandTitle: { ...typography.headlineMd, color: colors.primary, fontFamily: fonts.bold },
  brandSub: { ...typography.caption, color: colors.onSurfaceVariant, marginTop: 2 },
  formNoRight: { ...typography.caption, color: colors.onSurface, fontFamily: fonts.bold },
  docTitle: {
    ...typography.headlineMd,
    textAlign: 'center',
    fontFamily: fonts.bold,
    color: colors.onSurface,
    marginBottom: spacing.lg,
  },
  dateRow: { flexDirection: 'row', marginBottom: spacing.sm },
  dateCell: { flex: 1, ...typography.caption, color: colors.onSurface },
  dateCellRight: { textAlign: 'right' },
  dateLabel: { fontFamily: fonts.bold },
  section: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  sectionHeader: {
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  sectionHeaderText: { ...typography.caption, fontFamily: fonts.bold, color: colors.onSurface },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: '50%', padding: spacing.sm },
  musteriRow: { flexDirection: 'row' },
  musteriHalf: { flex: 1, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  kurulumRow: { flexDirection: 'row' },
  kurulumCell: { flex: 1, padding: spacing.sm },
  cell: { padding: spacing.sm },
  cellBorderRight: { borderRightWidth: 1, borderRightColor: colors.outlineVariant },
  cellBorderBottom: { borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  cellBorderTop: { borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  fieldLabel: { ...typography.caption, color: colors.onSurfaceVariant, marginBottom: 2 },
  fieldValue: { ...typography.bodySm, color: colors.onSurface, fontFamily: fonts.medium },
  alignRight: { alignItems: 'flex-end' },
  signatures: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    gap: spacing.md,
  },
  sigBlock: { flex: 1, alignItems: 'center' },
  sigTitle: { ...typography.caption, fontFamily: fonts.bold, marginBottom: spacing.md },
  sigName: { ...typography.bodySm, marginBottom: spacing.xs },
  sigLine: {
    width: '75%',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    borderStyle: 'dashed',
    marginBottom: spacing.xs,
    height: 24,
  },
  sigHint: { ...typography.caption, color: colors.onSurfaceVariant },
  zoomSpacer: { height: spacing.xl },
  zoomPill: {
    position: 'absolute',
    bottom: 130,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  zoomText: { ...typography.label, fontFamily: fonts.bold, width: 48, textAlign: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: layout.containerMargin,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    gap: spacing.sm,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 10,
    minHeight: 48,
  },
  btnPrimaryText: { ...typography.label, color: '#fff', fontFamily: fonts.bold },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    minHeight: 48,
  },
  btnSecondaryText: { ...typography.label, color: colors.primary, fontFamily: fonts.bold },
});
