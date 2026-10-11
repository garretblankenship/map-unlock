import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '../components/ProgressBar';
import { regionStats } from '../components/regionStats';
import { estimateDownload, formatBytes } from '../core/mapgeo';
import { shapeBoundsLatLng } from '../core/geometry';
import { LEVEL_LABELS, REGION_LEVELS, Region } from '../core/regions';
import { offlineAreas } from '../services/offlineAreas';
import { useStore } from '../state/store';
import { colors } from '../theme';

export default function RegionsScreen() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const here = new Set(store.position ? store.regionsAt(store.position).map((r) => r.id) : []);

  const open = (r: Region) => {
    store.selectRegion(r.id, true);
    router.navigate('/');
  };

  const confirmRemove = (r: Region) =>
    Alert.alert(`Remove ${r.name}?`, 'Your explored areas are kept; only this region’s progress card is removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void store.removeRegion(r.id) },
    ]);

  const saveOffline = (r: Region) => {
    const { ne, sw } = shapeBoundsLatLng(r.shape);
    const bounds: [number, number, number, number] = [sw.longitude, sw.latitude, ne.longitude, ne.latitude];
    const estimate = estimateDownload(bounds);
    if (estimate.tooBig) {
      Alert.alert(
        `${r.name} is too big to save`,
        'Save a smaller part instead: zoom the map in on where you’re going and tap the download button.',
      );
      return;
    }
    Alert.alert(
      `Save ${r.name} for offline use?`,
      `Roughly ${formatBytes(estimate.bytes)} (less in the countryside, more in cities). Wi-Fi recommended.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: () =>
            offlineAreas.save(r.name, bounds).then(
              () => router.navigate('/offline'),
              (e) => Alert.alert('Couldn’t save this area', e instanceof Error ? e.message : String(e)),
            ),
        },
      ],
    );
  };

  const regionActions = (r: Region) =>
    Alert.alert(r.name, undefined, [
      { text: 'Save for offline use', onPress: () => saveOffline(r) },
      { text: 'Remove region', style: 'destructive', onPress: () => confirmRemove(r) },
      { text: 'Cancel', style: 'cancel' },
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
    >
      <Text style={styles.title}>Regions</Text>
      <Text style={styles.subtitle}>
        Every area you explore is added here automatically, from neighbourhoods up to countries.
      </Text>

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
                  onLongPress={() => regionActions(r)}
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

      {store.ready && store.regions.length === 0 ? (
        <Text style={[styles.muted, { marginTop: 24 }]}>
          {store.discovering
            ? 'Looking up the areas around you…'
            : store.pendingPlaces > 0
              ? 'Your exploring is saved. The areas you visited will appear once you have signal.'
              : 'No regions yet. Start exploring and they’ll appear here.'}
        </Text>
      ) : null}

      <Text style={[styles.muted, { marginTop: 24 }]}>
        {store.unlocked.size.toLocaleString()} map cells unlocked. Long-press a region to save it offline or remove it.
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
  muted: { fontSize: 13, color: colors.muted },
  reset: { marginTop: 12, alignSelf: 'flex-start' },
  resetText: { color: colors.danger, fontWeight: '600' },
  attribution: { marginTop: 24, fontSize: 11, color: colors.muted },
});
