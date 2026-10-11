import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '../components/ProgressBar';
import { formatBytes } from '../core/mapgeo';
import { OfflineArea, offlineAreas, useOfflineAreas } from '../services/offlineAreas';
import { useStore } from '../state/store';
import { colors } from '../theme';

function statusLine(a: OfflineArea, offline: boolean): string {
  const size = a.bytes > 0 ? ` · ${formatBytes(a.bytes)}` : '';
  switch (a.state) {
    case 'complete':
      return `Ready to use offline${size}`;
    case 'error':
      return `Download problem: ${a.error ?? 'unknown error'}`;
    case 'waiting':
      return `${offline ? 'Waiting for signal' : 'Paused'} · ${Math.floor(a.progress * 100)}%${size}`;
    default:
      return `Downloading… ${Math.floor(a.progress * 100)}%${size}`;
  }
}

export default function OfflineScreen() {
  const store = useStore();
  const areas = useOfflineAreas();
  const insets = useSafeAreaInsets();
  const total = areas.reduce((n, a) => n + a.bytes, 0);

  const confirmRemove = (a: OfflineArea) =>
    Alert.alert(`Delete ${a.name}?`, 'The saved map for this area is removed from your phone. Your exploring is kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void offlineAreas.remove(a.id) },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40, paddingHorizontal: 16 }}
    >
      <Text style={styles.title}>Offline maps</Text>
      <Text style={styles.subtitle}>
        Heading somewhere without signal? Before you go, open the map on the area and tap{' '}
        <Ionicons name="cloud-download-outline" size={14} color={colors.muted} /> to save it. You can also
        long-press a region to save it.
      </Text>

      {offlineAreas.unavailable ? (
        <Text style={styles.error}>Offline maps need a development build of the app (not Expo Go).</Text>
      ) : null}

      {areas.length === 0 ? (
        <Text style={styles.muted}>No saved areas yet.</Text>
      ) : (
        <View style={styles.section}>
          {areas.map((a) => (
            <Pressable key={a.id} style={styles.row} onLongPress={() => confirmRemove(a)}>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={styles.rowHeader}>
                  <Ionicons
                    name={a.state === 'complete' ? 'checkmark-circle' : 'cloud-download-outline'}
                    size={18}
                    color={a.state === 'complete' ? colors.accent : colors.muted}
                  />
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {a.name}
                  </Text>
                </View>
                {a.state !== 'complete' ? <ProgressBar value={a.progress} height={6} /> : null}
                <Text style={[styles.rowSub, a.state === 'error' && { color: colors.danger }]}>
                  {statusLine(a, store.offline)}
                </Text>
              </View>
              <Pressable onPress={() => confirmRemove(a)} accessibilityLabel={`Delete ${a.name}`} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={colors.muted} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      {areas.length > 0 ? (
        <Text style={[styles.muted, { marginTop: 16 }]}>Using {formatBytes(total)} of storage.</Text>
      ) : null}
      <Text style={styles.note}>
        Without signal you can still explore anywhere: your progress is always saved. Saved areas add the map
        underneath, lakes and rivers, and the regions you’re working on. Areas you’ve recently looked at are also
        kept for a while.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 30, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 16 },
  section: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  rowSub: { fontSize: 12, color: colors.muted },
  muted: { fontSize: 13, color: colors.muted },
  error: { color: colors.danger, marginBottom: 12 },
  note: { marginTop: 24, fontSize: 12, color: colors.muted },
});
