import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '../components/ProgressBar';
import { regionStats } from '../components/regionStats';
import { LEVEL_LABELS, REGION_LEVELS, Region, RegionRecord } from '../core/regions';
import { searchRegions } from '../services/boundaries';
import { NetworkError } from '../services/net';
import { useStore } from '../state/store';
import { colors } from '../theme';

export default function RegionsScreen() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RegionRecord[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const here = new Set(store.position ? store.regionsAt(store.position).map((r) => r.id) : []);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchRegions(query.trim()));
    } catch (e) {
      setSearchError(
        e instanceof NetworkError
          ? 'Search needs a connection. Places you explore are still saved and looked up once you have signal.'
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setSearching(false);
    }
  };

  const open = (r: Region) => {
    store.selectRegion(r.id, true);
    router.navigate('/');
  };

  const add = async (rec: RegionRecord) => {
    await store.addRegions([rec]);
    setResults(null);
    setQuery('');
    store.selectRegion(rec.id, true);
    router.navigate('/');
  };

  const confirmRemove = (r: Region) =>
    Alert.alert(`Remove ${r.name}?`, 'Your explored areas are kept; only this region’s progress card is removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void store.removeRegion(r.id) },
    ]);

  const confirmReset = () =>
    Alert.alert('Reset all progress?', 'This re-fogs the whole map and forgets every region. It can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => void store.resetProgress() },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40, paddingHorizontal: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Regions</Text>
      <Text style={styles.subtitle}>
        Areas around you are added automatically as you explore. Search to add any city, state or country as a goal.
      </Text>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search a place, e.g. Sydney"
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
        />
        <Pressable style={styles.searchButton} onPress={search} accessibilityLabel="Search">
          {searching ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
        </Pressable>
      </View>
      {searchError ? <Text style={styles.error}>{searchError}</Text> : null}

      {results ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search results</Text>
          {results.length === 0 ? (
            <Text style={styles.muted}>No places with a boundary matched. Try a city, state or country name.</Text>
          ) : (
            results.map((r) => {
              const tracked = store.regions.some((x) => x.id === r.id);
              return (
                <Pressable key={r.id} style={styles.row} onPress={() => (tracked ? undefined : void add(r))}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{r.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={2}>
                      {LEVEL_LABELS[r.level]} · {r.displayName}
                    </Text>
                  </View>
                  <Text style={[styles.addLabel, tracked && { color: colors.muted }]}>
                    {tracked ? 'Added' : 'Add'}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      ) : null}

      {REGION_LEVELS.map((level) => {
        const list = store.regions.filter((r) => r.level === level);
        if (list.length === 0) return null;
        return (
          <View key={level} style={styles.section}>
            <Text style={styles.sectionTitle}>{LEVEL_LABELS[level]}</Text>
            {list.map((r) => {
              const s = regionStats(r);
              const selected = r.id === store.selectedRegionId;
              return (
                <Pressable
                  key={r.id}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => open(r)}
                  onLongPress={() => confirmRemove(r)}
                >
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {here.has(r.id) ? <Text style={styles.badge}>You are here</Text> : null}
                      <View style={{ flex: 1 }} />
                      <Text style={styles.percent}>{s.percent}</Text>
                    </View>
                    <ProgressBar value={s.fraction} height={6} />
                    <Text style={styles.rowSub}>
                      {s.explored} of {s.total} of land{s.landPending ? ' (measuring water…)' : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {store.ready && store.regions.length === 0 && !results ? (
        <Text style={[styles.muted, { marginTop: 24 }]}>
          {store.discovering
            ? 'Looking up the areas around you…'
            : store.pendingPlaces > 0
              ? 'Your exploring is saved. The areas you visited will appear once you have signal.'
              : 'No regions yet. Start walking or search above.'}
        </Text>
      ) : null}

      <Text style={[styles.muted, { marginTop: 24 }]}>
        {store.unlocked.size.toLocaleString()} map cells unlocked. Long-press a region to remove it.
      </Text>
      <Pressable onPress={confirmReset} style={styles.reset}>
        <Text style={styles.resetText}>Reset all progress</Text>
      </Pressable>
      <Text style={styles.attribution}>
        Boundaries and water © OpenStreetMap contributors · water tiles by OpenFreeMap / OpenMapTiles
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 30, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: 20, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: { borderColor: colors.accent, borderWidth: 2 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  rowSub: { fontSize: 12, color: colors.muted },
  percent: { fontSize: 16, fontWeight: '800', color: colors.accent, fontVariant: ['tabular-nums'] },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  addLabel: { fontSize: 15, fontWeight: '700', color: colors.accent, marginLeft: 12 },
  muted: { fontSize: 13, color: colors.muted },
  error: { color: colors.danger, marginTop: 8 },
  reset: { marginTop: 12, alignSelf: 'flex-start' },
  resetText: { color: colors.danger, fontWeight: '600' },
  attribution: { marginTop: 24, fontSize: 11, color: colors.muted },
});
