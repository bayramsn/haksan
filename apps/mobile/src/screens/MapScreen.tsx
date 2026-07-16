import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Polygon, Ellipse, Line, G } from 'react-native-svg';

const PRIMARY = '#000c69';

const companies = [
  { id: '1', name: 'Haksan Makina', code: 'C-001', city: 'İstanbul', sector: 'Üretim', avatarColor: '#000c69', status: 'Aktif' },
  { id: '2', name: 'Asil Çelik', code: 'C-002', city: 'Bursa', sector: 'Otomotiv', avatarColor: '#10B981', status: 'Aktif' },
  { id: '3', name: 'Demirbağ Endüstri', code: 'C-003', city: 'Ankara', sector: 'Savunma', avatarColor: '#F59E0B', status: 'Pasif' },
  { id: '4', name: 'Zirve Kalıp', code: 'C-004', city: 'Kocaeli', sector: 'Otomotiv', avatarColor: '#8B5CF6', status: 'Aktif' },
  { id: '5', name: 'Ege Metal', code: 'C-005', city: 'İzmir', sector: 'Üretim', avatarColor: '#EC4899', status: 'Aktif' },
  { id: '6', name: 'İç Anadolu Tarım', code: 'C-006', city: 'Konya', sector: 'Tarım', avatarColor: '#14B8A6', status: 'Aktif' },
];

const CITY_COORDS: Record<string, { x: number; y: number }> = {
  'İstanbul': { x: 72, y: 28 },
  'Ankara': { x: 58, y: 38 },
  'İzmir': { x: 22, y: 52 },
  'Bursa': { x: 48, y: 32 },
  'Kocaeli': { x: 64, y: 28 },
  'Konya': { x: 60, y: 60 },
};

const MAP_HEIGHT = 280;

export function MapScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const { width } = Dimensions.get('window');

  const companiesWithCoords = companies.filter(c => CITY_COORDS[c.city]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1a1c1d" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Firma Haritası</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Map Area */}
      <View style={styles.mapArea}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          {/* Grid lines */}
          <G opacity={0.2}>
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => (
              <G key={v}>
                <Line x1={v} y1="0" x2={v} y2="100" stroke="#94A3B8" strokeWidth="0.3" />
                <Line x1="0" y1={v} x2="100" y2={v} stroke="#94A3B8" strokeWidth="0.3" />
              </G>
            ))}
          </G>

          {/* Turkey outline (simplified polygon) */}
          <Polygon
            points="12,40 18,30 30,25 45,20 60,18 75,22 88,25 95,32 92,42 85,50 78,58 70,72 60,78 48,80 35,75 22,68 15,58"
            fill="#D1DCF0" stroke="#B0C4DE" strokeWidth="0.5"
          />
          {/* Simplified water areas */}
          <Ellipse cx="85" cy="18" rx="8" ry="5" fill="#BFDBFE" opacity={0.6} />
          <Ellipse cx="15" cy="52" rx="6" ry="8" fill="#BFDBFE" opacity={0.6} />
        </Svg>

        {/* City Pins */}
        {companiesWithCoords.map((company) => {
          const coords = CITY_COORDS[company.city];
          const isSelected = selected === company.id;
          
          const pinLeft = (coords.x / 100) * width;
          const pinTop = (coords.y / 100) * MAP_HEIGHT;

          return (
            <View
              key={company.id}
              style={[
                styles.pinContainer,
                { left: pinLeft, top: pinTop, zIndex: isSelected ? 20 : 10 }
              ]}
            >
              <TouchableOpacity
                onPress={() => setSelected(isSelected ? null : company.id)}
                activeOpacity={0.8}
                style={[
                  styles.pinDot,
                  {
                    backgroundColor: isSelected ? PRIMARY : company.avatarColor,
                    borderColor: isSelected ? '#1E3A8A' : '#ffffff',
                    transform: [{ scale: isSelected ? 1.3 : 1 }],
                  }
                ]}
              >
                <Ionicons name="location" size={12} color="#ffffff" />
              </TouchableOpacity>
              
              {isSelected && (
                <View style={styles.tooltip}>
                  <Text style={styles.tooltipTitle}>{company.name}</Text>
                  <Text style={styles.tooltipSub}>{company.city}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Firma Haritası</Text>
          <Text style={styles.legendSub}>{companiesWithCoords.length} firma</Text>
        </View>
      </View>

      {/* Company List */}
      <View style={styles.listHeader}>
        <Text style={styles.listHeaderText}>{companies.length} firma listeleniyor</Text>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {companies.map((company) => (
          <TouchableOpacity
            key={company.id}
            onPress={() => setSelected(company.id === selected ? null : company.id)}
            style={[
              styles.companyRow,
              selected === company.id && styles.companyRowSelected
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: company.avatarColor }]}>
              <Text style={styles.avatarText}>{company.name.charAt(0)}</Text>
            </View>
            <View style={styles.companyInfo}>
              <Text style={styles.companyName} numberOfLines={1}>{company.name}</Text>
              <View style={styles.companyMeta}>
                <Ionicons name="location" size={10} color="#6b7280" />
                <Text style={styles.companyMetaText}>{company.city} · {company.sector}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f7f8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 56,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#1a1c1d' },

  mapArea: {
    height: MAP_HEIGHT,
    backgroundColor: '#E8EDF5',
    position: 'relative',
    overflow: 'hidden',
  },
  pinContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // offset to center the pin over coordinates
    transform: [{ translateX: -14 }, { translateY: -14 }],
  },
  pinDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tooltip: {
    position: 'absolute',
    top: 32,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    width: 100, // rough fixed width to center text properly
    transform: [{ translateX: -36 }], // (100 - 28) / 2 = 36 to center
  },
  tooltipTitle: { fontSize: 10, fontWeight: '700', color: '#111827', textAlign: 'center' },
  tooltipSub: { fontSize: 9, color: '#6b7280', textAlign: 'center' },

  legend: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  legendTitle: { fontSize: 10, fontWeight: '600', color: '#374151' },
  legendSub: { fontSize: 9, color: '#6b7280', marginTop: 2 },

  listHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  listHeaderText: { fontSize: 12, color: '#6b7280' },

  list: { flex: 1, backgroundColor: '#ffffff' },
  listContent: { paddingBottom: 100 },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  companyRowSelected: {
    backgroundColor: '#EEF2FF',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  companyInfo: { flex: 1 },
  companyName: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 2 },
  companyMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  companyMetaText: { fontSize: 11, color: '#6b7280' },
});
