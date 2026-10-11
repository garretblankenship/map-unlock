import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { addPendingPlace } from '../core/pending';
import { Fix, cellsForMove, isUsableFix } from '../core/reveal';
import { t } from '../i18n';
import { store } from '../state/store';
import { getLastFix, saveCells, setLastFix, updatePendingPlaces } from './db';

export const BACKGROUND_TASK = 'map-unlock-background-location';

function toFix(loc: Location.LocationObject): Fix {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    timestamp: loc.timestamp,
    accuracy: loc.coords.accuracy,
    speed: loc.coords.speed,
  };
}

/**
 * Turns GPS fixes into unlocked cells and saves them. Safe to call from the
 * background task while the UI isn't running: it only touches the database,
 * then informs the in-memory store if the app happens to be alive.
 */
export function ingestFixes(fixes: Fix[]): Promise<void> {
  // Process one batch at a time so each batch continues the previous trail.
  const run = ingestQueue.then(() => ingest(fixes));
  ingestQueue = run.catch((e) => store.setError(e instanceof Error ? e.message : String(e)));
  return run;
}

let ingestQueue: Promise<unknown> = Promise.resolve();

async function ingest(fixes: Fix[]): Promise<void> {
  let last = await getLastFix();
  const keys = new Set<number>();
  for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
    if (!isUsableFix(fix)) continue;
    if (last && fix.timestamp <= last.timestamp) continue;
    for (const k of cellsForMove(last, fix)) keys.add(k);
    last = fix;
  }
  if (!last || keys.size === 0) return;
  await setLastFix(last);
  const added = await saveCells([...keys], store.ready ? store.unlocked : undefined);
  if (store.ready) {
    store.applyNewCells(added);
  } else {
    // With the UI asleep nobody checks which areas we're in, so remember where
    // we went; the app looks those places up next time it has a connection.
    const at = last;
    await updatePendingPlaces((l) => addPendingPlace(l, at));
  }
}

// Background updates are delivered here, even if the app was swiped away
// (Android) or suspended (iOS). Must be defined at module load time.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BACKGROUND_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length || store.demoActive) return;
  await ingestFixes(data.locations.map(toFix));
  const latest = data.locations[data.locations.length - 1];
  if (store.ready) store.setPosition(latest.coords);
});

let foregroundSub: Location.LocationSubscription | null = null;

export async function startForegroundTracking(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    store.setError(t('location.permissionNeeded'));
    return false;
  }
  foregroundSub?.remove();
  foregroundSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
    (loc) => {
      // While the simulated walk runs it owns the position and the trail.
      if (store.demoActive) return;
      store.setPosition(loc.coords);
      void ingestFixes([toFix(loc)]);
    },
    (reason) => store.setError(t('location.error', { reason })),
  );
  store.setError(null);
  store.setTracking(true, store.backgroundTracking);
  return true;
}

export function stopForegroundTracking() {
  foregroundSub?.remove();
  foregroundSub = null;
  store.setTracking(false, store.backgroundTracking);
}

/**
 * Keeps unlocking while the phone is in your pocket. Needs "Always" location
 * permission and a development/production build (not Expo Go).
 */
export async function startBackgroundTracking(): Promise<boolean> {
  try {
    if (!(await Location.isBackgroundLocationAvailableAsync())) {
      store.setError(t('location.backgroundUnavailable'));
      return false;
    }
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      store.setError(t('location.allowAlways'));
      return false;
    }
    await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 10,
      // Not "Fitness": that tunes iOS for pedestrians, and driving counts too.
      activityType: Location.ActivityType.Other,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: t('location.notification.title'),
        notificationBody: t('location.notification.body'),
        notificationColor: '#2E7D5B',
      },
    });
    store.setError(null);
    store.setTracking(store.tracking, true);
    return true;
  } catch (e) {
    store.setError(e instanceof Error ? e.message : String(e));
    return false;
  }
}

export async function stopBackgroundTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
  }
  store.setTracking(store.tracking, false);
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK).catch(() => false);
}
