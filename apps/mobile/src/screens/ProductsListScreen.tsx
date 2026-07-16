import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const PRIMARY = '#000c69';
const RED = '#cf060c';

type ProductCategory = 'all' | 'cnc' | 'sac' | 'universal' | 'aksesuar';

interface Product {
  id: string;
  brand: string;
  modelCode: string;
  modelName: string;
  fullName: string;
  category: ProductCategory;
  listPrice: number;
  cashPrice?: number;
  currency: 'EUR' | 'TRY';
  stockCode: string;
  inStock: number;
}

const PRODUCTS: Product[] = [
  { id: 'pr1', brand: 'Haksan', modelCode: 'VMC-850', modelName: 'VMC 850', fullName: 'Haksan VMC 850 CNC Freze Merkezi', category: 'cnc', listPrice: 45000, cashPrice: 42000, currency: 'EUR', stockCode: 'CNC-VMC-850', inStock: 3 },
  { id: 'pr2', brand: 'Haksan', modelCode: 'VMC-1100', modelName: 'VMC 1100', fullName: 'Haksan VMC 1100 CNC Freze Merkezi', category: 'cnc', listPrice: 58000, cashPrice: 54000, currency: 'EUR', stockCode: 'CNC-VMC-1100', inStock: 2 },
  { id: 'pr3', brand: 'Haksan', modelCode: 'TC-500', modelName: 'TC 500', fullName: 'Haksan TC 500 CNC Torna', category: 'cnc', listPrice: 28000, cashPrice: 26000, currency: 'EUR', stockCode: 'CNC-TC-500', inStock: 4 },
  { id: 'pr4', brand: 'Haksan', modelCode: 'FC-3015', modelName: 'FC 3015', fullName: 'Haksan FC 3015 Fiber Lazer Kesim', category: 'sac', listPrice: 120000, cashPrice: 112000, currency: 'EUR', stockCode: 'SAC-FC-3015', inStock: 2 },
  { id: 'pr5', brand: 'Haksan', modelCode: 'P-3000', modelName: 'P3000', fullName: 'Haksan P3000 Plazma Kesim Sistemi', category: 'sac', listPrice: 38000, cashPrice: 35000, currency: 'EUR', stockCode: 'SAC-P-3000', inStock: 1 },
  { id: 'pr6', brand: 'Haksan', modelCode: 'R-2040', modelName: 'R2040', fullName: 'Haksan R2040 CNC Router', category: 'universal', listPrice: 22000, cashPrice: 20500, currency: 'EUR', stockCode: 'UNI-R-2040', inStock: 4 },
  { id: 'pr7', brand: 'Haksan', modelCode: 'HTC-200', modelName: 'HTC 200', fullName: 'Haksan HTC 200 Yatay Torna', category: 'cnc', listPrice: 32000, currency: 'EUR', stockCode: 'CNC-HTC-200', inStock: 1 },
  { id: 'pr8', brand: 'Siemens', modelCode: 'S840D', modelName: 'Sinumerik 840D', fullName: 'Siemens Sinumerik 840D CNC Kontrol', category: 'aksesuar', listPrice: 8500, currency: 'EUR', stockCode: 'AKS-S840D', inStock: 6 },
];

const CATEGORY_TABS: { key: ProductCategory; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'cnc', label: 'CNC' },
  { key: 'sac', label: 'Sac İşleme' },
  { key: 'universal', label: 'Universal' },
  { key: 'aksesuar', label: 'Aksesuar' },
];

const CATEGORY_COLOR: Record<ProductCategory, string> = {
  all: PRIMARY,
  cnc: PRIMARY,
  sac: '#F97316',
  universal: '#8B5CF6',
  aksesuar: '#14B8A6',
};

const CATEGORY_BG: Record<ProductCategory, string> = {
  all: '#EEF2FF',
  cnc: '#EEF2FF',
  sac: '#FFF7ED',
  universal: '#F5F3FF',
  aksesuar: '#F0FDFA',
};

const screenWidth = Dimensions.get('window').width;
const cardWidth = (screenWidth - 32 - 12) / 2; // padding 16*2, gap 12

export function ProductsListScreen() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<ProductCategory>('all');

  const filtered = PRODUCTS.filter(p => {
    const matchSearch = `${p.brand} ${p.modelCode} ${p.modelName} ${p.fullName}`.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'all' || p.category === activeCategory;
    return matchSearch && matchCat;
  });

  const renderHeader = () => (
    <View style={styles.headerBar}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Ürünler</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {renderHeader()}

      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
          {CATEGORY_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveCategory(tab.key)}
              style={[styles.tabBtn, activeCategory === tab.key && styles.tabBtnActive]}
            >
              <Text style={[styles.tabText, activeCategory === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.toolbar}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={14} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Marka, model veya kod ara..."
            placeholderTextColor="#9ca3af"
          />
        </View>
        <TouchableOpacity style={styles.importBtn}>
          <Ionicons name="cloud-upload-outline" size={14} color="#717182" />
          <Text style={styles.importBtnText}>İçe Aktar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>{filtered.length} ürün</Text>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.gridContainer}>
        {filtered.map(p => {
          const color = CATEGORY_COLOR[p.category];
          const bg = CATEGORY_BG[p.category];
          const hasStock = p.inStock > 0;
          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.8}
              onPress={() => router.push(`/modules/products/${p.id}`)}
              style={[styles.productCard, { width: cardWidth }]}
            >
              <View style={[styles.cardImageArea, { backgroundColor: bg }]}>
                <Text style={[styles.cardImageText, { color }]}>
                  {p.modelCode.split('-')[0]}
                </Text>
              </View>
              <View style={styles.cardInfoArea}>
                <Text style={styles.brandText} numberOfLines={1}>{p.brand}</Text>
                <Text style={styles.modelText} numberOfLines={1}>{p.modelName}</Text>
                <Text style={[styles.priceText, { color }]}>€{p.cashPrice ?? p.listPrice}</Text>
                
                <View style={styles.stockRow}>
                  <Text style={styles.stockCodeText}>{p.stockCode}</Text>
                  <View style={[styles.stockBadge, { backgroundColor: hasStock ? '#ECFDF5' : '#FEF2F2' }]}>
                    <Text style={[styles.stockBadgeText, { color: hasStock ? '#059669' : RED }]}>
                      {hasStock ? `${p.inStock} adet` : 'Yok'}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
        <Ionicons name="add" size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  
  tabsWrapper: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  tabsContainer: { paddingHorizontal: 16 },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: PRIMARY },
  tabText: { fontSize: 12, fontWeight: '600', color: '#717182' },
  tabTextActive: { color: PRIMARY },

  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
    gap: 8,
  },
  searchWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#1a1c1d', padding: 0 },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 6,
  },
  importBtnText: { fontSize: 12, fontWeight: '500', color: '#717182' },

  statsBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  statsText: { fontSize: 11, color: '#717182' },

  scrollArea: { flex: 1 },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
    paddingBottom: 100,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    overflow: 'hidden',
  },
  cardImageArea: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImageText: { fontSize: 24, fontWeight: '900', opacity: 0.3 },
  cardInfoArea: { padding: 10 },
  brandText: { fontSize: 10, fontWeight: '600', color: '#717182' },
  modelText: { fontSize: 12, fontWeight: '700', color: '#1a1c1d', marginTop: 2 },
  priceText: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  stockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  stockCodeText: { fontSize: 9, fontFamily: 'Courier', color: '#717182' },
  stockBadge: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 },
  stockBadgeText: { fontSize: 9, fontWeight: '600' },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 8,
  },
});
