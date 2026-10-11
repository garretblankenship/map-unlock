import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapView,
  NativeUserLocation,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '../components/ProgressBar';
import { regionStats } from '../components/regionStats';
import { Viewport } from '../core/fog';
import { shapeBoundsLatLng, shapeOutlines } from '../core/geometry';
import { Bounds, estimateDownload, fogToGeoJSON, formatBytes, linesToGeoJSON, viewportFromBounds } from '../core/mapgeo';
import { LEVEL_LABELS } from '../core/regions';
import { startDemoWalk, stopDemoWalk } from '../services/demo';
import { MAP_STYLE } from '../services/mapStyle';
import { offlineAreas } from '../services/offlineAreas';
import { startBackgroundTracking, stopBackgroundTracking } from '../services/tracking';
import { useStore } from '../state/store';
import { colors } from '../theme';

const WORLD: Viewport = { north: 70, south: -55, east: 180, west: -180 };
const STREET_ZOOM = 15;

export default function MapScreen() {
  const store = useStore();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const [viewport, setViewport] = useState<Viewport>(WORLD);
  const [demo, setDemo] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const centeredOnce = useRef(false);

  // Recompute fog when the camera settles or new cells are unlocked.
  const unlockedCount = store.unlocked.size;
  const fog = useMemo(
    () => fogToGeoJSON(store.fog(viewport).polygons),
    [viewport, unlockedCount, store.ready, store.waterVersion],
  );

  // Water is never fogged; fetch it for whatever is on screen.
  useEffect(() => store.requestWater(viewport), [viewport]);

  const region = store.selectedRegion;
  const outlines = useMemo(() => linesToGeoJSON(region ? shapeOutlines(region.shape) : []), [region]);
  const stats = region ? regionStats(region) : null;

  // Jump to the user the first time we learn where they are (once the map can move).
  useEffect(() => {
    if (mapReady && store.position && !centeredOnce.current) {
      centeredOnce.current = true;
      const { longitude, latitude } = store.position;
      cameraRef.current?.easeTo({ center: [longitude, latitude], zoom: STREET_ZOOM, duration: 600 });
    }
  }, [store.position, mapReady]);

  // Frame the region when it's picked from the regions list.
  useEffect(() => {
    const target = store.selectedRegion;
    if (store.focusToken === 0 || !target) return;
    const { ne, sw } = shapeBoundsLatLng(target.shape);
    cameraRef.current?.fitBounds([sw.longitude, sw.latitude, ne.longitude, ne.latitude], {
      padding: { top: 160, right: 40, bottom: 140, left: 40 },
      duration: 800,
    });
  }, [store.focusToken]);

  const onRegionDidChange = (e: NativeSyntheticEvent<ViewStateChangeEvent>) =>
    setViewport(viewportFromBounds(e.nativeEvent.bounds));

  const centerOnMe = () => {
    if (!store.position) return;
    const { longitude, latitude } = store.position;
    cameraRef.current?.easeTo({ center: [longitude, latitude], zoom: STREET_ZOOM, duration: 400 });
  };

  const saveArea = () => {
    const bounds: Bounds = [viewport.west, viewport.south, viewport.east, viewport.north];
    const estimate = estimateDownload(bounds);
    if (estimate.tooBig) {
      Alert.alert('Area too big', 'Zoom in on the place you’re heading to, then save it.');
      return;
    }
    const center = { latitude: (viewport.north + viewport.south) / 2, longitude: (viewport.east + viewport.west) / 2 };
    const name = store.regionsAt(center)[0]?.name ?? `Area at ${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)}`;
    Alert.alert(
      'Save this area for offline use?',
      `Saves the map, water and boundaries for what’s on screen, so it works without signal. ` +
        `Roughly ${formatBytes(estimate.bytes)} (less in the countryside, more in cities). Wi-Fi recommended.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: () =>
            offlineAreas.save(name, bounds).then(
              () => router.navigate('/offline'),
              (e) => Alert.alert('Couldn’t save this area', e instanceof Error ? e.message : String(e)),
            ),
        },
      ],
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
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        onRegionDidChange={onRegionDidChange}
        onDidFinishLoadingStyle={() => setMapReady(true)}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        logo={false}
        attributionPosition={{ bottom: 128, right: 8 }}
      >
        <Camera ref={cameraRef} initialViewState={{ center: [0, 20], zoom: 1 }} />
        <GeoJSONSource id="fog" data={fog}>
          <Layer id="fog-fill" type="fill" paint={{ 'fill-color': colors.fog, 'fill-antialias': false }} />
        </GeoJSONSource>
        <GeoJSONSource id="region-outline" data={outlines}>
          <Layer
            id="region-outline-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-color': colors.accent, 'line-width': 3 }}
          />
        </GeoJSONSource>
        <NativeUserLocation />
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
        <Pressable style={styles.round} onPress={saveArea} accessibilityLabel="Save this area for offline use">
          <Ionicons name="cloud-download-outline" size={22} color={colors.text} />
        </Pressable>
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
