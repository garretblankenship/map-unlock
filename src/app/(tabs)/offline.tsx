import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '../../components/ProgressBar';
import { formatBytes } from '../../core/mapgeo';
import { t } from '../../i18n';
import { OfflineArea, offlineAreas, useOfflineAreas } from '../../services/offlineAreas';
import { useStore } from '../../state/store';
import { makeStyles, useColors } from '../../theme';

function statusLine(a: OfflineArea, offline: boolean): string {
  const size = a.bytes > 0 ? ` · ${formatBytes(a.bytes)}` : '';
  const percent = Math.floor(a.progress * 100);
  switch (a.state) {
    case 'complete':
      return t('offline.ready', { size });
    case 'error':
      return t('offline.problem', { error: a.error ?? t('offline.unknownError') });
    case 'waiting':
      return offline ? t('offline.waitingForSignal', { percent, size }) : t('offline.paused', { percent, size });
    default:
      return t('offline.downloading', { percent, size });
  }
}

export default function OfflineScreen() {
  const colors = useColors();
  const styles = useStyles();
  const store = useStore();
  const areas = useOfflineAreas();
  const insets = useSafeAreaInsets();
  const total = areas.reduce((n, a) => n + a.bytes, 0);

  const confirmRemove = (a: OfflineArea) =>
    Alert.alert(t('offline.delete.title', { name: a.name }), t('offline.delete.body'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('action.delete'), style: 'destructive', onPress: () => void offlineAreas.remove(a.id) },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40, paddingHorizontal: 16 }}
    >
      <Text style={styles.title}>{t('offline.title')}</Text>
      <Text style={styles.subtitle}>
        {t('offline.intro.before')}
        <Ionicons name="cloud-download-outline" size={14} color={colors.muted} />
        {t('offline.intro.after')}
      </Text>

      {offlineAreas.unavailable ? (
        <Text style={styles.error}>{t('save.needsDevBuild')}</Text>
      ) : null}

      {areas.length === 0 ? (
        <Text style={styles.muted}>{t('offline.empty')}</Text>
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
              <Pressable onPress={() => confirmRemove(a)} accessibilityLabel={t('offline.a11y.delete', { name: a.name })} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={colors.muted} />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      {areas.length > 0 ? (
        <Text style={[styles.muted, { marginTop: 16 }]}>{t('offline.storage', { size: formatBytes(total) })}</Text>
      ) : null}
      <Text style={styles.note}>{t('offline.note')}</Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
