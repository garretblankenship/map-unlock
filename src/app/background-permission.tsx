import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { BackgroundStep } from '../core/permissions';
import { TextKey, t } from '../i18n';
import { getBackgroundStep, startBackgroundTracking } from '../services/tracking';
import { colors } from '../theme';

/**
 * Explains background location before the system asks for it. Apple and
 * Google both expect this, and people grant it more often when they know
 * why. Opened from the map's background-exploring switch.
 */
export default function BackgroundPermissionScreen() {
  const { step } = useLocalSearchParams<{ step?: BackgroundStep }>();
  const insets = useSafeAreaInsets();
  const blocked = step === 'openSettings';
  // The system prompt briefly backgrounds the app, so both paths below can
  // fire; only the first may start tracking and close this screen.
  const done = useRef(false);
  const finish = async () => {
    if (done.current) return;
    done.current = true;
    await startBackgroundTracking();
    router.back();
  };

  // Coming back from the phone's Settings with "Always" allowed: start right away.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && (await getBackgroundStep()) === 'start') await finish();
    });
    return () => sub.remove();
  }, []);

  const proceed = async () => {
    if (blocked) {
      await Linking.openSettings();
      return;
    }
    await finish();
  };

  const points: [keyof typeof Ionicons.glyphMap, TextKey][] = [
    ['lock-closed-outline', 'background.point.private'],
    ['battery-half-outline', 'background.point.battery'],
    ['toggle-outline', 'background.point.stop'],
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Ionicons name="footsteps-outline" size={44} color={colors.accent} style={{ alignSelf: 'center' }} />
      <Text style={styles.title}>{t('background.title')}</Text>
      <Text style={styles.body}>{t('background.body')}</Text>
      <View style={styles.points}>
        {points.map(([icon, key]) => (
          <View key={key} style={styles.point}>
            <Ionicons name={icon} size={20} color={colors.accent} />
            <Text style={styles.pointText}>{t(key)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>
        {blocked ? t('background.blocked') : Platform.OS === 'ios' ? t('background.ios') : t('background.android')}
      </Text>
      <Pressable style={styles.primary} onPress={() => void proceed()} accessibilityRole="button">
        <Text style={styles.primaryText}>{blocked ? t('background.openSettings') : t('background.continue')}</Text>
      </Pressable>
      <Pressable style={styles.secondary} onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.secondaryText}>{t('background.notNow')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: 15, color: colors.text, textAlign: 'center', lineHeight: 21 },
  points: { gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 16 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pointText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  primary: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { paddingVertical: 10, alignItems: 'center' },
  secondaryText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
});
