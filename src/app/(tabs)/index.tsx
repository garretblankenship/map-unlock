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
import {
  ActivityIndicator,
  Alert,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressBar } from '../../components/ProgressBar';
import { regionStats } from '../../components/regionStats';
import { Viewport } from '../../core/fog';
import { shapeBoundsLatLng, shapeOutlines } from '../../core/geometry';
import { Bounds, estimateDownload, fogToGeoJSON, formatBytes, linesToGeoJSON, viewportFromBounds } from '../../core/mapgeo';
import { t } from '../../i18n';
import { startDemoWalk, stopDemoWalk } from '../../services/demo';
import { MAP_STYLE, MAP_STYLE_DARK } from '../../services/mapStyle';
import { offlineAreas } from '../../services/offlineAreas';
import { getBackgroundStep, startBackgroundTracking, stopBackgroundTracking } from '../../services/tracking';
import { useStore } from '../../state/store';
import { makeStyles, useColors } from '../../theme';

const WORLD: Viewport = { north: 70, south: -55, east: 180, west: -180 };
const STREET_ZOOM = 15;

export default function MapScreen() {
  const colors = useColors();
  const styles = useStyles();
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
  const stats = region ? regionStats(region, store.units) : null;

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
      Alert.alert(t('map.areaTooBig.title'), t('map.areaTooBig.body'));
      return;
    }
    const center = { latitude: (viewport.north + viewport.south) / 2, longitude: (viewport.east + viewport.west) / 2 };
    const name = store.regionsAt(center)[0]?.name ??
      t('map.areaName', { lat: center.latitude.toFixed(3), lon: center.longitude.toFixed(3) });
    Alert.alert(
      t('map.saveArea.title'),
      t('map.saveArea.body', { size: formatBytes(estimate.bytes) }),
      [
        { text: t('action.cancel'), style: 'cancel' },
        {
          text: t('action.save'),
          onPress: () =>
            offlineAreas.save(name, bounds).then(
              () => router.navigate('/offline'),
              (e) => Alert.alert(t('save.failed'), e instanceof Error ? e.message : String(e)),
            ),
        },
      ],
    );
  };

  const toggleBackground = async () => {
    if (store.backgroundTracking) return stopBackgroundTracking();
    const step = await getBackgroundStep();
    if (step === 'start') await startBackgroundTracking();
    else router.push({ pathname: '/background-permission', params: { step } });
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
        mapStyle={useColorScheme() === 'dark' ? MAP_STYLE_DARK : MAP_STYLE}
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
                <Text style={styles.cardKicker}>{t(`level.${region.level}`).toUpperCase()}</Text>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {region.name}
                </Text>
              </View>
              <Text style={styles.cardPercent}>{stats.percent}</Text>
              <Pressable
                onPress={() => router.push({ pathname: '/share', params: { id: region.id } })}
                accessibilityRole="button"
                accessibilityLabel={t('share.a11y.open')}
                hitSlop={10}
                style={styles.cardShare}
              >
                <Ionicons name="share-outline" size={20} color={colors.accent} />
              </Pressable>
            </View>
            <ProgressBar value={stats.fraction} />
            <Text style={styles.cardSub}>
              {t('progress.landUnlocked', { explored: stats.explored, total: stats.total })}
              {stats.landPending ? t('progress.measuringWater') : ''}
              {t('map.tapToChange')}
            </Text>
          </>
        ) : (
          <View style={styles.cardHeader}>
            {store.discovering || store.regionsLoading ? <ActivityIndicator color={colors.accent} /> : null}
            <Text style={styles.cardSub}>
              {store.regionsLoading
                ? t('map.loadingRegions')
                : store.discovering
                  ? t('map.finding')
                  : store.offline && store.position
                    ? t('map.noSignal')
                    : store.position
                      ? t('map.noRegions')
                      : t('map.waitingForLocation')}
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
            {store.offline ? t('map.offlineSaved') : t('map.weakSignal')}
            {store.pendingPlaces > 0 ? t('map.placesToLookUp', { count: store.pendingPlaces }) : ''}
          </Text>
        </View>
      ) : null}

      <View style={[styles.controls, { bottom: 24 }]}>
        <Pressable style={styles.pill} onPress={() => void toggleBackground()}>
          <View style={[styles.dot, { backgroundColor: store.backgroundTracking ? colors.accent : colors.muted }]} />
          <Text style={styles.pillText}>
            {store.backgroundTracking ? t('map.backgroundOn') : t('map.backgroundOff')}
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {__DEV__ ? (
          <Pressable style={styles.round} onPress={toggleDemo} accessibilityLabel={t('map.a11y.demo')}>
            <Ionicons name={demo ? 'stop' : 'walk'} size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable style={styles.round} onPress={saveArea} accessibilityLabel={t('map.a11y.saveArea')}>
          <Ionicons name="cloud-download-outline" size={22} color={colors.text} />
        </Pressable>
        <Pressable style={styles.round} onPress={centerOnMe} accessibilityLabel={t('map.a11y.centerOnMe')}>
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

const useStyles = makeStyles((colors) => ({
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
  cardShare: { marginLeft: 4 },
  cardPercent: { fontSize: 26, fontWeight: '800', color: colors.accent, fontVariant: ['tabular-nums'] },
  cardSub: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  error: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.dangerSoft,
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
}));
