import { StyleSheet, View } from 'react-native';

import { colors } from '../theme';

export function ProgressBar({ value, height = 8 }: { value: number; height?: number }) {
  // Keep a sliver visible once any progress exists, even in enormous regions.
  const pct = value > 0 ? Math.max(1.5, Math.min(100, value * 100)) : 0;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={[styles.fill, { width: `${pct}%`, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.accentSoft, overflow: 'hidden', width: '100%' },
  fill: { backgroundColor: colors.accent, height: '100%' },
});
