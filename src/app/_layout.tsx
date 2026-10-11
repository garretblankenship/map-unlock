// Registers the background location task; must load before anything else.
import {
  isBackgroundTrackingActive,
  pauseForegroundTracking,
  resumeForegroundTracking,
  startForegroundTracking,
} from '../services/tracking';

import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { t } from '../i18n';
import { startNetworkMonitor } from '../services/net';
import { offlineAreas } from '../services/offlineAreas';
import { store } from '../state/store';
import { darkColors, lightColors } from '../theme';

/** Navigation chrome (tab bar, headers, screen backgrounds) in the app's colors. */
const navLight = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: lightColors.accent,
    background: lightColors.background,
    card: lightColors.card,
    text: lightColors.text,
    border: lightColors.border,
  },
};
const navDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: darkColors.accent,
    background: darkColors.background,
    card: darkColors.card,
    text: darkColors.text,
    border: darkColors.border,
  },
};

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  useEffect(() => {
    let cancelled = false;
    const stopNetworkMonitor = startNetworkMonitor();
    (async () => {
      try {
        await store.load();
        void offlineAreas.start();
        const background = await isBackgroundTrackingActive();
        if (cancelled) return;
        store.setTracking(store.tracking, background);
        await startForegroundTracking();
      } catch (e) {
        store.setError(e instanceof Error ? e.message : String(e));
      }
    })();

    // Pick up anything the background task unlocked while we were away, and
    // retry lookups that waited for a connection (water, places to look up).
    const sub = AppState.addEventListener('change', (state) => {
      // Off screen: no on-screen GPS and no rendering. ("inactive" is only a
      // brief interruption, e.g. a system prompt, so it doesn't count.)
      if (state === 'background') {
        pauseForegroundTracking();
        store.setVisible(false);
      }
      if (state === 'active') {
        store.setVisible(true);
        void resumeForegroundTracking();
      }
      if (state === 'active' && store.ready) {
        store.refreshPhonePreferences();
        void store.refreshCells();
        store.retryNetwork();
        void offlineAreas.resumeAll();
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
      stopNetworkMonitor();
    };
  }, []);

  return (
    <ThemeProvider value={dark ? navDark : navLight}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerTintColor: (dark ? darkColors : lightColors).accent }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="background-permission" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="share" options={{ presentation: 'modal', title: t('share.title') }} />
        <Stack.Screen name="settings" options={{ title: t('settings.title'), headerBackTitle: t('regions.title') }} />
      </Stack>
    </ThemeProvider>
  );
}
