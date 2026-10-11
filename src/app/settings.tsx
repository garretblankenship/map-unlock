import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { UnitPreference } from '../core/units';
import { t } from '../i18n';
import { useStore } from '../state/store';
import { makeStyles, useColors } from '../theme';

const UNIT_OPTIONS: UnitPreference[] = ['auto', 'metric', 'imperial'];

export default function SettingsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const store = useStore();

  const unitLabel = (u: UnitPreference) =>
    u === 'auto' ? t('settings.units.auto') : u === 'metric' ? t('settings.units.metric') : t('settings.units.imperial');
  const unitDetail = (u: UnitPreference) => {
    if (u === 'metric') return t('settings.units.metricDetail');
    if (u === 'imperial') return t('settings.units.imperialDetail');
    return t('settings.units.autoDetail', {
      system: store.phoneUnits === 'imperial' ? t('settings.units.imperial') : t('settings.units.metric'),
    });
  };

  const confirmReset = () =>
    Alert.alert(t('regions.reset.title'), t('regions.reset.body'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('action.reset'), style: 'destructive', onPress: () => void store.resetProgress() },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
    >
      <Text style={styles.sectionTitle}>{t('settings.units')}</Text>
      <View style={styles.group}>
        {UNIT_OPTIONS.map((u, i) => {
          const selected = store.settings.units === u;
          return (
            <Pressable
              key={u}
              style={[styles.option, i > 0 && styles.optionDivider]}
              onPress={() => void store.updateSettings({ units: u })}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{unitLabel(u)}</Text>
                <Text style={styles.optionDetail}>{unitDetail(u)}</Text>
              </View>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>{t('settings.progress')}</Text>
      <View style={styles.group}>
        <Pressable style={styles.option} onPress={confirmReset} accessibilityRole="button">
          <Text style={[styles.optionTitle, { color: colors.danger }]}>{t('regions.reset')}</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>{t('settings.attribution')}</Text>
      <Text style={styles.attribution}>{t('regions.attribution')}</Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 24,
    marginBottom: 8,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  option: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  optionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  optionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  optionDetail: { fontSize: 12, color: colors.muted, marginTop: 2 },
  attribution: { fontSize: 12, color: colors.muted },
}));
