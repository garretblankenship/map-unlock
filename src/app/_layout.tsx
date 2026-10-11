// Registers the background location task; must load before anything else.
import { startForegroundTracking, isBackgroundTrackingActive } from '../services/tracking';

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { store } from '../state/store';
import { colors } from '../theme';

export default function RootLayout() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await store.load();
        const background = await isBackgroundTrackingActive();
        if (cancelled) return;
        store.setTracking(store.tracking, background);
        await startForegroundTracking();
      } catch (e) {
        store.setError(e instanceof Error ? e.message : String(e));
      }
    })();

    // Pick up anything the background task unlocked while we were away, and
    // retry water lookups that failed (e.g. while offline).
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && store.ready) {
        void store.refreshCells();
        store.loadRegionWater();
      }
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Map',
            tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="regions"
          options={{
            title: 'Regions',
            tabBarIcon: ({ color, size }) => <Ionicons name="trophy" color={color} size={size} />,
          }}
        />
      </Tabs>
    </>
  );
}
