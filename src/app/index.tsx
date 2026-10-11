import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Polygon, Polyline, Region as MapRegion } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '../components/ProgressBar';
import { regionStats } from '../components/regionStats';
import { Viewport } from '../core/fog';
import { shapeBoundsLatLng, shapeOutlines } from '../core/geometry';
import { LEVEL_LABELS } from '../core/regions';
import { startDemoWalk, stopDemoWalk } from '../services/demo';
import { startBackgroundTracking, stopBackgroundTracking } from '../services/tracking';
import { useStore } from '../state/store';
import { colors } from '../theme';

const WORLD: MapRegion = { latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 };
const STREET_DELTA = 0.012;

function toViewport(r: MapRegion): Viewport {
  return {
    north: r.latitude + r.latitudeDelta / 2,
    south: r.latitude - r.latitudeDelta / 2,
    east: r.longitude + r.longitudeDelta / 2,
    west: r.longitude - r.longitudeDelta / 2,
  };
}

export default function MapScreen() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const [mapRegion, setMapRegion] = useState<MapRegion>(WORLD);
  const [demo, setDemo] = useState(false);
  const centeredOnce = useRef(false);

  // Recompute fog when the camera settles or new cells are unlocked.
  const unlockedCount = store.unlocked.size;
  const fog = useMemo(
    () => store.fog(toViewport(mapRegion)),
    [mapRegion, unlockedCount, store.ready, store.waterVersion],
  );

  // Water is never fogged; fetch it for whatever is on screen.
  useEffect(() => store.requestWater(toViewport(mapRegion)), [mapRegion]);

  const region = store.selectedRegion;
  const outlines = useMemo(() => (region ? shapeOutlines(region.shape) : []), [region]);
  const stats = region ? regionStats(region) : null;

  // Jump to the user the first time we learn where they are.
  useEffect(() => {
    if (store.position && !centeredOnce.current) {
      centeredOnce.current = true;
      mapRef.current?.animateToRegion(
        { ...store.position, latitudeDelta: STREET_DELTA, longitudeDelta: STREET_DELTA },
        600,
      );
    }
  }, [store.position]);

  // Frame the region when it's picked from the regions list.
  useEffect(() => {
    const target = store.selectedRegion;
    if (store.focusToken === 0 || !target) return;
    const { ne, sw } = shapeBoundsLatLng(target.shape);
    mapRef.current?.fitToCoordinates([ne, sw], {
      edgePadding: { top: 160, right: 40, bottom: 140, left: 40 },
      animated: true,
    });
  }, [store.focusToken]);

  const centerOnMe = () => {
    if (!store.position) return;
    mapRef.current?.animateToRegion(
      { ...store.position, latitudeDelta: STREET_DELTA, longitudeDelta: STREET_DELTA },
      400,
    );
  };

  const toggleBackground = () => {
    if (store.backgroundTracking) void stopBackgroundTracking();
    else void startBackgroundTracking();
  };

  const toggleDemo = () => {
    if (demo) {
      stopDemoWalk();
      setDemo(false);
    } else if (store.position) {
      startDemoWalk(store.position);
      setDemo(true);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={WORLD}
        onRegionChangeComplete={setMapRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {fog.polygons.map((p, i) => (
          <Polygon
            key={`fog-${i}`}
            coordinates={p.outer}
            holes={p.holes}
            fillColor={colors.fog}
            strokeWidth={0}
            strokeColor="transparent"
          />
        ))}
        {outlines.map((line, i) => (
          <Polyline key={`outline-${i}`} coordinates={line} strokeColor={colors.accent} strokeWidth={3} />
        ))}
      </MapView>

      <Pressable
        style={[styles.card, { top: insets.top + 12 }]}
        onPress={() => router.navigate('/regions')}
      >
        {region && stats ? (
          <>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardKicker}>{LEVEL_LABELS[region.level].toUpperCase()}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {region.name}
                </Text>
              </View>
              <Text style={styles.cardPercent}>{stats.percent}</Text>
            </View>
            <ProgressBar value={stats.fraction} />
            <Text style={styles.cardSub}>
              {stats.explored} of {stats.total} of land unlocked
              {stats.landPending ? ' (measuring water…)' : ''} · tap to change region
            </Text>
          </>
        ) : (
          <View style={styles.cardHeader}>
            {store.discovering ? <ActivityIndicator color={colors.accent} /> : null}
            <Text style={styles.cardSub}>
              {store.discovering
                ? 'Finding the areas around you…'
                : store.offline && store.position
                  ? 'No signal — exploring still counts. Areas are looked up once you’re back online.'
                  : store.position
                  ? 'No regions yet — tap to search for a city to unlock.'
                  : 'Waiting for your location…'}
            </Text>
          </View>
        )}
      </Pressable>

      {store.lastError ? (
        <Pressable style={[styles.error, { top: insets.top + 130 }]} onPress={() => store.setError(null)}>
          <Text style={styles.errorText}>{store.lastError}</Text>
        </Pressable>
      ) : null}

      {store.offline || (store.pendingPlaces > 0 && !store.discovering) ? (
        <View style={[styles.pill, styles.status]}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} />
          <Text style={styles.pillText}>
            {store.offline ? 'Offline · progress is saved' : 'Waiting for a better signal'}
            {store.pendingPlaces > 0
              ? ` · ${store.pendingPlaces} ${store.pendingPlaces === 1 ? 'place' : 'places'} to look up`
              : ''}
          </Text>
        </View>
      ) : null}

      <View style={[styles.controls, { bottom: 24 }]}>
        <Pressable style={styles.pill} onPress={toggleBackground}>
          <View style={[styles.dot, { backgroundColor: store.backgroundTracking ? colors.accent : colors.muted }]} />
          <Text style={styles.pillText}>
            {store.backgroundTracking ? 'Exploring in background' : 'Background exploring off'}
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {__DEV__ ? (
          <Pressable style={styles.round} onPress={toggleDemo} accessibilityLabel="Simulate a walk">
            <Ionicons name={demo ? 'stop' : 'walk'} size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable style={styles.round} onPress={centerOnMe} accessibilityLabel="Center on my location">
          <Ionicons name="locate" size={22} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    ...shadow,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardKicker: { fontSize: 11, fontWeight: '700', color: colors.accent, letterSpacing: 0.6 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  cardPercent: { fontSize: 26, fontWeight: '800', color: colors.accent, fontVariant: ['tabular-nums'] },
  cardSub: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  error: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#FEF3F2',
    borderRadius: 12,
    padding: 12,
    ...shadow,
  },
  errorText: { color: colors.danger, fontSize: 13 },
  controls: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 44,
    ...shadow,
  },
  status: { position: 'absolute', left: 16, bottom: 80, height: 36, alignSelf: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.text },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
});
