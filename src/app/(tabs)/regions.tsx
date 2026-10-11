import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '../../components/ProgressBar';
import { regionStats } from '../../components/regionStats';
import { estimateDownload, formatBytes } from '../../core/mapgeo';
import { shapeBoundsLatLng } from '../../core/geometry';
import { REGION_LEVELS, Region } from '../../core/regions';
import { t } from '../../i18n';
import { offlineAreas } from '../../services/offlineAreas';
import { useStore } from '../../state/store';
import { makeStyles, useColors } from '../../theme';

export default function RegionsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const here = new Set(store.position ? store.regionsAt(store.position).map((r) => r.id) : []);

  const open = (r: Region) => {
    store.selectRegion(r.id, true);
    router.navigate('/');
  };

  const confirmRemove = (r: Region) =>
    Alert.alert(t('regions.remove.title', { name: r.name }), t('regions.remove.body'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('action.remove'), style: 'destructive', onPress: () => void store.removeRegion(r.id) },
    ]);

  const saveOffline = (r: Region) => {
    const { ne, sw } = shapeBoundsLatLng(r.shape);
    const bounds: [number, number, number, number] = [sw.longitude, sw.latitude, ne.longitude, ne.latitude];
    const estimate = estimateDownload(bounds);
    if (estimate.tooBig) {
      Alert.alert(
        t('regions.tooBig.title', { name: r.name }),
        t('regions.tooBig.body'),
      );
      return;
    }
    Alert.alert(
      t('regions.save.title', { name: r.name }),
      t('regions.save.body', { size: formatBytes(estimate.bytes) }),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.save'),
          onPress: () =>
            offlineAreas.save(r.name, bounds).then(
              () => router.navigate('/offline'),
              (e) => Alert.alert(t('save.failed'), e instanceof Error ? e.message : String(e)),
            ),
        },
      ],
    );
  };

  const regionActions = (r: Region) =>
    Alert.alert(r.name, undefined, [
      { text: t('regions.action.share'), onPress: () => router.push({ pathname: '/share', params: { id: r.id } }) },
      { text: t('regions.action.saveOffline'), onPress: () => saveOffline(r) },
      { text: t('regions.action.remove'), style: 'destructive', onPress: () => confirmRemove(r) },
      { text: t('action.cancel'), style: 'cancel' },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40, paddingHorizontal: 16 }}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('regions.title')}</Text>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={t('settings.a11y.open')}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
      </View>
      <Text style={styles.subtitle}>{t('regions.subtitle')}</Text>

      {REGION_LEVELS.map((level) => {
        const list = store.regions.filter((r) => r.level === level);
        if (list.length === 0) return null;
        return (
          <View key={level} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(`levels.${level}`)}</Text>
            {list.map((r) => {
              const s = regionStats(r, store.units);
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
                      {here.has(r.id) ? <Text style={styles.badge}>{t('regions.youAreHere')}</Text> : null}
                      <View style={{ flex: 1 }} />
                      <Text style={styles.percent}>{s.percent}</Text>
                    </View>
                    <ProgressBar value={s.fraction} height={6} />
                    <Text style={styles.rowSub}>
                      {t('progress.ofLand', { explored: s.explored, total: s.total })}
                      {s.landPending ? t('progress.measuringWater') : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      {store.ready && !store.regionsLoading && store.regions.length === 0 ? (
        <Text style={[styles.muted, { marginTop: 24 }]}>
          {store.discovering
            ? t('regions.lookingUp')
            : store.pendingPlaces > 0
              ? t('regions.savedAwaitingSignal')
              : t('regions.empty')}
        </Text>
      ) : null}

      <Text style={[styles.muted, { marginTop: 24 }]}>
        {t('regions.cellsUnlocked', { count: store.unlocked.size.toLocaleString() })}
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
}));
