import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '../state/store';
import { makeStyles, useColors } from '../theme';

/** Room for the tab bar and the map's controls and status pill below the indicator. */
const BOTTOM_OFFSET = 180;

/**
 * A small pill with a spinner and a message, shown over every screen while
 * something slow is running (see core/busy.ts). It never blocks touches.
 */
export function BusyIndicator() {
  const store = useStore();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const label = store.busyLabel;
  // Keep the last message while fading out.
  const [shownLabel, setShownLabel] = useState(label);
  if (label && label !== shownLabel) setShownLabel(label);
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacity, { toValue: label ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [label, opacity]);

  if (!shownLabel) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pill, { bottom: insets.bottom + BOTTOM_OFFSET, opacity }]}
      // Hidden from screen readers once faded out.
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      accessibilityRole="progressbar"
      accessibilityLabel={shownLabel}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.text} numberOfLines={2}>
        {shownLabel}
      </Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => ({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  text: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
}));
