// Registers the background location task; must load before anything else.
import { startForegroundTracking, isBackgroundTrackingActive } from '../services/tracking';

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { t } from '../i18n';
import { startNetworkMonitor } from '../services/net';
import { offlineAreas } from '../services/offlineAreas';
import { store } from '../state/store';
import { colors } from '../theme';

export default function RootLayout() {
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
      if (state === 'active' && store.ready) {
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
    <>
      <StatusBar style="dark" />
      <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('tab.map'),
            tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="regions"
          options={{
            title: t('tab.regions'),
            tabBarIcon: ({ color, size }) => <Ionicons name="trophy" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="offline"
          options={{
            title: t('tab.offline'),
            tabBarIcon: ({ color, size }) => <Ionicons name="cloud-download" color={color} size={size} />,
          }}
        />
      </Tabs>
    </>
  );
}
