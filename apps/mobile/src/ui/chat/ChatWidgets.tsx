import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatConversationSummary } from '@/src/api/services';
import { colors, fonts, layout, radius, spacing, typography } from '@/src/theme/tokens';
import { pressFade, shadowCard, shadowFab } from '@/src/theme/styles';

const cardBase: ViewStyle = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  ...shadowCard,
};

const SEGMENTS = ['Tümü', 'Grup', 'Birebir', 'Firma'] as const;
export type ChatSegment = (typeof SEGMENTS)[number];
export { SEGMENTS };

/** Stitch `20e9867b` — başlık + arama / yeni sohbet */
export function ChatListHeader({
  onSearchPress,
  onCompose,
}: {
  onSearchPress?: () => void;
  onCompose?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Sohbet</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={onSearchPress}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && styles.headerIconBtnPressed,
              pressFade(pressed),
            ]}
            accessibilityLabel="Ara"
          >
            <Ionicons name="search-outline" size={24} color={colors.stitchPrimary} />
          </Pressable>
          <Pressable
            onPress={onCompose}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && styles.headerIconBtnPressed,
              pressFade(pressed),
            ]}
            accessibilityLabel="Yeni sohbet"
          >
            <Ionicons name="create-outline" size={24} color={colors.stitchPrimary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function ChatSearchField({
  value,
  onChangeText,
  inputRef,
}: {
  value: string;
  onChangeText: (t: string) => void;
  inputRef?: React.Ref<TextInput>;
}) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={20} color={colors.onSurfaceVariant} style={styles.searchIcon} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder="Kişi veya mesaj ara..."
        placeholderTextColor={colors.onSurfaceVariant}
        style={styles.searchInput}
        autoCapitalize="none"
        clearButtonMode="while-editing"
        returnKeyType="search"
      />
    </View>
  );
}

export function ChatSegmentControl({
  value,
  onChange,
}: {
  value: ChatSegment;
  onChange: (v: ChatSegment) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
      {SEGMENTS.map((seg) => {
        const active = seg === value;
        return (
          <Pressable
            key={seg}
            onPress={() => onChange(seg)}
            style={[styles.segmentBtn, active && styles.segmentBtnActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{seg}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PinnedChatCard({
  title,
  preview,
  timeLabel,
  unreadCount,
  avatar,
  onPress,
}: {
  title: string;
  preview: string;
  timeLabel: string;
  unreadCount?: number;
  avatar: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pinnedCard, pressFade(pressed)]}>
      <View style={styles.pinnedTop}>
        {avatar}
        {unreadCount && unreadCount > 0 ? (
          <View style={styles.pinnedBadge}>
            <Text style={styles.pinnedBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.pinnedTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.pinnedPreview} numberOfLines={2}>
        {preview}
      </Text>
      <Text style={styles.pinnedTime}>{timeLabel}</Text>
    </Pressable>
  );
}

export function PinnedChatsSection({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!children) return null;
  return (
    <View style={styles.pinnedSection}>
      <Text style={styles.sectionLabel}>Sabitlenenler</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pinnedRow}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function ChatListRow({
  title,
  preview,
  timeLabel,
  avatar,
  unreadDot,
  readReceipt,
  attachment,
  onPress,
  showDivider,
}: {
  title: string;
  preview: string;
  timeLabel: string;
  avatar: React.ReactNode;
  unreadDot?: boolean;
  readReceipt?: boolean;
  attachment?: boolean;
  onPress?: () => void;
  showDivider?: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.chatRow, pressed && styles.chatRowPressed, pressFade(pressed)]}
      >
        {avatar}
        <View style={styles.chatRowBody}>
          <View style={styles.chatRowTop}>
            <Text style={styles.chatRowTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.chatRowTime}>{timeLabel}</Text>
          </View>
          <View style={styles.chatRowPreviewRow}>
            {readReceipt ? (
              <Ionicons name="checkmark-done" size={16} color={colors.surfaceTint} style={styles.previewIcon} />
            ) : null}
            {attachment ? (
              <Ionicons name="attach" size={16} color={colors.onSurfaceVariant} style={styles.previewIcon} />
            ) : null}
            <Text style={styles.chatRowPreview} numberOfLines={1}>
              {preview}
            </Text>
          </View>
        </View>
        {unreadDot ? <View style={styles.unreadDot} /> : null}
      </Pressable>
      {showDivider ? <View style={styles.rowDivider} /> : null}
    </>
  );
}

export function AllChatsSectionHeader() {
  return (
    <View style={styles.allChatsSection}>
      <Text style={styles.sectionLabel}>Tüm Sohbetler</Text>
    </View>
  );
}

export function AllChatsRowWrap({ children }: { children: React.ReactNode }) {
  return <View style={styles.allChatsRowWrap}>{children}</View>;
}

export function ChatFab({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.fabHost} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.fab, shadowFab, pressFade(pressed)]}
        accessibilityRole="button"
        accessibilityLabel="Yeni sohbet"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

type Conv = ChatConversationSummary;

export function conversationKind(conv: Conv): 'dm' | 'group' | 'company' {
  if (conv.type === 'dm') return 'dm';
  const title = conv.title?.trim() ?? '';
  if (title.startsWith('#')) return 'group';
  return 'company';
}

export function displayTitle(conv: Conv, myUserId: string | undefined): string {
  if (conv.type === 'group' && conv.title) return conv.title;
  if (conv.type === 'dm') {
    const other = conv.members.find((m) => m.userId !== myUserId);
    if (other?.fullName) {
      const parts = other.fullName.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
      return other.fullName;
    }
    return 'Sohbet';
  }
  return conv.title ?? 'Sohbet';
}

export function displayPreview(conv: Conv, myUserId: string | undefined): string {
  const last = conv.lastMessage;
  if (!last) return 'Henüz mesaj yok';
  const sender = conv.members.find((m) => m.userId === last.senderId);
  const name = sender?.fullName?.split(/\s+/)[0] ?? 'Kullanıcı';
  const preview = last.preview ?? '';
  if (last.senderId === myUserId) return `Sen: ${preview}`;
  if (conv.type === 'dm') return preview;
  return `${name}: ${preview}`;
}

export function matchesSegment(conv: Conv, segment: ChatSegment): boolean {
  if (segment === 'Tümü') return true;
  const kind = conversationKind(conv);
  if (segment === 'Birebir') return kind === 'dm';
  if (segment === 'Grup') return kind === 'group';
  if (segment === 'Firma') return kind === 'company';
  return true;
}

export function matchesSearch(conv: Conv, q: string, myUserId: string | undefined): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const title = displayTitle(conv, myUserId).toLowerCase();
  const preview = displayPreview(conv, myUserId).toLowerCase();
  const members = conv.members.map((m) => `${m.fullName} ${m.email}`.toLowerCase()).join(' ');
  return title.includes(needle) || preview.includes(needle) || members.includes(needle);
}

export function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Şimdi';
    if (diffMin < 60) return `${diffMin} dk`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} sa`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Dün';
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffDay < 7) return `${diffDay} gün`;
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  } catch {
    return '—';
  }
}

function groupIcon(title: string): keyof typeof Ionicons.glyphMap {
  const t = title.toLowerCase();
  if (t.includes('servis')) return 'construct';
  if (t.includes('yönetim') || t.includes('yonetim')) return 'shield-checkmark';
  if (t.includes('satış') || t.includes('satis')) return 'people';
  return 'people';
}

function companyIcon(title: string): keyof typeof Ionicons.glyphMap {
  const t = title.toLowerCase();
  if (t.includes('metal') || t.includes('market')) return 'storefront-outline';
  if (t.includes('plast') || t.includes('fabrika')) return 'construct-outline';
  return 'business-outline';
}

function dmInitials(fullName: string | undefined): string {
  const parts = (fullName ?? '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

export function ChatAvatar({ conv, myUserId, size = 'md' }: { conv: Conv; myUserId?: string; size?: 'sm' | 'md' }) {
  const kind = conversationKind(conv);
  const dim = size === 'sm' ? 40 : 48;
  const iconSize = size === 'sm' ? 20 : 22;

  if (kind === 'dm') {
    const other = conv.members.find((m) => m.userId !== myUserId);
    const initials = dmInitials(other?.fullName);
    return (
      <View style={[styles.avatarDm, { width: dim, height: dim, borderRadius: dim / 2 }]}>
        <Text style={[styles.avatarInitials, size === 'sm' && styles.avatarInitialsSm]}>{initials}</Text>
      </View>
    );
  }

  if (kind === 'group') {
    const title = conv.title ?? '';
    return (
      <View style={[styles.avatarGroup, { width: dim, height: dim, borderRadius: dim / 2 }]}>
        <Ionicons name={groupIcon(title)} size={iconSize} color="#fff" />
      </View>
    );
  }

  const title = conv.title ?? '';
  return (
    <View style={[styles.avatarCompany, { width: dim, height: dim, borderRadius: dim / 2 }]}>
      <Ionicons name={companyIcon(title)} size={iconSize} color={colors.textPrimary} />
    </View>
  );
}

export function pickPinned(conversations: Conv[]): Conv[] {
  const withUnread = conversations.filter((c) => c.unreadCount > 0);
  const pool = withUnread.length > 0 ? withUnread : conversations;
  return pool.slice(0, 2);
}

const styles = StyleSheet.create({
  headerWrap: { backgroundColor: colors.canvas },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: layout.containerMargin,
  },
  headerTitle: {
    ...typography.headline,
    fontFamily: fonts.bold,
    color: colors.stitchPrimary,
    letterSpacing: -0.22,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerIconBtnPressed: {
    backgroundColor: colors.surfaceContainerHigh,
  },
  searchWrap: {
    marginHorizontal: layout.containerMargin,
    marginTop: spacing.sm,
    position: 'relative',
    zIndex: 30,
  },
  searchIcon: { position: 'absolute', left: spacing.lg, top: 14, zIndex: 1 },
  searchInput: {
    height: 48,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.sm,
    paddingLeft: 44,
    paddingRight: spacing.lg,
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  segmentWrap: {
    flexDirection: 'row',
    marginHorizontal: layout.containerMargin,
    marginTop: spacing.lg,
    padding: spacing.xs,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.sm,
    zIndex: 30,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.card,
    ...shadowCard,
  },
  segmentText: {
    ...typography.label,
    color: colors.onSurfaceVariant,
  },
  segmentTextActive: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  pinnedSection: { marginBottom: spacing.sm },
  sectionLabel: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginHorizontal: layout.containerMargin,
    marginBottom: spacing.md,
  },
  pinnedRow: {
    paddingHorizontal: layout.containerMargin,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  pinnedCard: {
    width: 144,
    ...cardBase,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 128,
  },
  pinnedTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
  },
  pinnedBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pinnedBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.semibold,
    color: '#fff',
  },
  pinnedTitle: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  pinnedPreview: {
    ...typography.label,
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  pinnedTime: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    ...typography.caption,
    color: colors.onSurfaceVariant,
    opacity: 0.7,
  },
  allChatsSection: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xs,
    minHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.02,
    shadowRadius: 24,
    elevation: 4,
  },
  allChatsRowWrap: {
    backgroundColor: colors.card,
    paddingBottom: spacing.xs,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.containerMargin,
    paddingVertical: spacing.md,
    position: 'relative',
    minHeight: 72,
  },
  chatRowPressed: {
    backgroundColor: colors.surfaceContainerLow,
  },
  chatRowBody: { flex: 1, marginLeft: spacing.md, minWidth: 0, paddingRight: spacing.xxl },
  chatRowTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  chatRowTitle: {
    ...typography.bodySm,
    fontFamily: fonts.semibold,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  chatRowTime: {
    ...typography.caption,
    color: colors.onSurfaceVariant,
  },
  chatRowPreviewRow: { flexDirection: 'row', alignItems: 'center' },
  previewIcon: { marginRight: 4 },
  chatRowPreview: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    flex: 1,
  },
  unreadDot: {
    position: 'absolute',
    right: layout.containerMargin,
    bottom: spacing.lg,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.error,
    borderWidth: 2,
    borderColor: colors.card,
  },
  fabHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  rowDivider: {
    marginLeft: 76,
    marginRight: layout.containerMargin,
    height: 1,
    backgroundColor: colors.surfaceVariant,
  },
  avatarGroup: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarDm: {
    backgroundColor: colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    ...typography.headlineMd,
    fontSize: 14,
    color: colors.onSecondaryFixedVariant,
    fontFamily: fonts.bold,
  },
  avatarInitialsSm: { fontSize: 12 },
  avatarCompany: {
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(198, 197, 211, 0.3)',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
});
