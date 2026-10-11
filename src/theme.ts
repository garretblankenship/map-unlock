import { StyleSheet, useColorScheme } from 'react-native';

/** Colors for one appearance. Light and dark follow the phone's setting. */
export type Palette = {
  accent: string;
  accentSoft: string;
  /** Text and icons drawn on top of `accent`. */
  onAccent: string;
  /** The fog over unexplored land, drawn on the map. */
  fog: string;
  text: string;
  muted: string;
  border: string;
  card: string;
  background: string;
  danger: string;
  dangerSoft: string;
};

export const lightColors: Palette = {
  accent: '#2E7D5B',
  accentSoft: '#D7EFE3',
  onAccent: '#FFFFFF',
  fog: 'rgba(72, 78, 88, 0.78)',
  text: '#1B1F24',
  muted: '#6B7280',
  border: '#E5E7EB',
  card: '#FFFFFF',
  background: '#F4F5F7',
  danger: '#B42318',
  dangerSoft: '#FEF3F2',
};

export const darkColors: Palette = {
  accent: '#4CC38A',
  accentSoft: '#1D3A2D',
  onAccent: '#0B1A12',
  // Lighter than the near-black dark map, so fogged land reads as covered.
  fog: 'rgba(72, 80, 96, 0.86)',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  border: '#2D323A',
  card: '#1B1E23',
  background: '#0F1114',
  danger: '#F97066',
  dangerSoft: '#3A1D1B',
};

export function useColors(): Palette {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}

/**
 * Styles that follow the appearance: `const useStyles = makeStyles((c) => ({...}))`,
 * then `const styles = useStyles()` inside the component. Each appearance's
 * styles are created once.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(create: (colors: Palette) => T): () => T {
  const cache = new Map<Palette, T>();
  return function useStyles() {
    const colors = useColors();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(create(colors));
      cache.set(colors, styles);
    }
    return styles;
  };
}
