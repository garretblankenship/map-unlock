import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { regionStats } from '../components/regionStats';
import { outlinePath } from '../core/shareCard';
import { t } from '../i18n';
import { useStore } from '../state/store';
import { makeStyles, useColors } from '../theme';

/** The card's own look, the same in light and dark mode so shared images are consistent. */
const CARD = {
  background: '#123B2C',
  outline: '#4CC38A',
  outlineFill: 'rgba(76, 195, 138, 0.22)',
  text: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.7)',
  track: 'rgba(255, 255, 255, 0.18)',
};
const CARD_WIDTH = 320;
const CARD_HEIGHT = 400;
const SHAPE_WIDTH = CARD_WIDTH - 48;
const SHAPE_HEIGHT = 170;

/**
 * Previews and shares an image card for one region: its outline, name and
 * percentage unlocked. The explored streets are deliberately left out.
 */
export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const region = store.regions.find((r) => r.id === id);
  const path = useMemo(() => (region ? outlinePath(region.shape, SHAPE_WIDTH, SHAPE_HEIGHT, 4) : ''), [region]);
  if (!region) return null;
  const stats = regionStats(region, store.units);

  const share = async () => {
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error(t('share.unavailable'));
      const uri = await captureRef(cardRef, { format: 'png', width: CARD_WIDTH * 3, height: CARD_HEIGHT * 3 });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: t('share.dialogTitle', { name: region.name }),
      });
      router.back();
    } catch (e) {
      Alert.alert(t('share.failed'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View ref={cardRef} style={card.root} collapsable={false}>
        <Text style={card.kicker}>{t(`level.${region.level}`).toUpperCase()}</Text>
        <Text style={card.title} numberOfLines={2}>
          {region.name}
        </Text>
        <Svg width={SHAPE_WIDTH} height={SHAPE_HEIGHT} style={card.shape}>
          <Path
            d={path}
            fill={CARD.outlineFill}
            stroke={CARD.outline}
            strokeWidth={2}
            fillRule="evenodd"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={card.percent}>{stats.percent}</Text>
        <Text style={card.unlocked}>{t('share.unlocked')}</Text>
        <View style={card.track}>
          <View style={[card.fill, { width: `${Math.max(stats.fraction > 0 ? 2 : 0, stats.fraction * 100)}%` }]} />
        </View>
        <View style={card.footer}>
          <Ionicons name="compass-outline" size={16} color={CARD.muted} />
          <Text style={card.app}>{t('share.app')}</Text>
        </View>
      </View>

      <Text style={styles.privacy}>{t('share.privacy')}</Text>
      <Pressable style={styles.button} onPress={() => void share()} disabled={busy} accessibilityRole="button">
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <>
            <Ionicons name="share-outline" size={20} color={colors.onAccent} />
            <Text style={styles.buttonText}>{t('share.button')}</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

const card = StyleSheet.create({
  root: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: CARD.background,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  kicker: { color: CARD.outline, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: CARD.text, fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  shape: { marginVertical: 14 },
  percent: { color: CARD.text, fontSize: 44, fontWeight: '900', fontVariant: ['tabular-nums'] },
  unlocked: { color: CARD.muted, fontSize: 14, marginTop: -2 },
  track: { width: '100%', height: 8, borderRadius: 4, backgroundColor: CARD.track, overflow: 'hidden', marginTop: 12 },
  fill: { height: '100%', backgroundColor: CARD.outline, borderRadius: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' },
  app: { color: CARD.muted, fontSize: 13, fontWeight: '700' },
});

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, alignItems: 'center', gap: 16 },
  privacy: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  button: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
  },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
}));
