import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { type Href, router } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { resolve } from 'node:path';
import { Alert, type AlertButton } from 'react-native';

import type { RegionRecord } from '../src/core/regions';
import * as db from '../src/services/db';
import { store } from '../src/state/store';
import { fakeOfflineManager } from './fakeOfflineManager';

export { fakeOfflineManager };

const APP_DIR = resolve(__dirname, '../src/app');

/** Starts the whole app (root layout, tabs, real store and database) at a route. */
export async function renderApp(initialUrl = '/') {
  // Startup ends by turning on the on-screen GPS, after progress has loaded.
  const watch = Location.watchPositionAsync as jest.Mock;
  const watchesBefore = watch.mock.calls.length;
  // renderRouter turns on fake timers, which only fake the clock here (see
  // "fakeTimers" in package.json): the app's own timers run as on a phone.
  const app = renderRouter(APP_DIR, { initialUrl });
  jest.useRealTimers();
  await app;
  await waitFor(() => expect(watch.mock.calls.length).toBeGreaterThan(watchesBefore));
  await waitFor(() => expect(store.regionsLoading).toBe(false));
  /** The current route, e.g. "/share". */
  return { pathname: () => app.getPathname(), params: () => app.getSearchParams() };
}

/** Opens a screen the way the app does, on top of the map, so it can go back. */
export async function openOnTopOfMap(href: string) {
  const app = await renderApp('/');
  router.push(href as Href);
  await waitFor(() => expect(app.pathname()).toBe(href.split('?')[0]));
  return app;
}

/*
 * Things that happen to the phone (a GPS fix, signal, a dialog button) are
 * not wrapped in act(): the app reacts asynchronously anyway, so tests wait
 * for the result with findBy/waitFor. An act() here would overlap with the
 * app's own updates and stall later renders.
 */

/** The phone's GPS reports a new position. */
export function moveTo(latitude: number, longitude: number) {
  (Location as unknown as { mockMoveTo: (lat: number, lon: number) => void }).mockMoveTo(latitude, longitude);
}

type Permission = 'granted' | 'ask' | 'blocked';
export function setLocationPermissions(foreground: Permission, background: Permission) {
  (Location as unknown as { mockSetPermissions: (f: Permission, b: Permission) => void }).mockSetPermissions(
    foreground,
    background,
  );
}

export function setOnline(online: boolean) {
  (Network as unknown as { mockSet: (online: boolean) => void }).mockSet(online);
}

/** A square region about 1 km across, centred on a point. */
export function squareRegion(
  id: string,
  name: string,
  level: RegionRecord['level'],
  center: { latitude: number; longitude: number },
  half = 0.005,
): RegionRecord {
  const { latitude: y, longitude: x } = center;
  return {
    id,
    name,
    displayName: `${name}, Testshire`,
    level,
    createdAt: Date.now(),
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x - half, y - half],
          [x + half, y - half],
          [x + half, y + half],
          [x - half, y + half],
          [x - half, y - half],
        ],
      ],
    },
  };
}

/** Puts regions in the database before the app starts, as if found on an earlier day. */
export async function seedRegions(...regions: RegionRecord[]) {
  for (const r of regions) await db.saveRegion(r);
}

/** Records Alert.alert calls so a test can press one of the dialog's buttons. */
export function watchAlerts() {
  const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  return {
    titles: () => spy.mock.calls.map((c) => c[0]),
    press(title: string, button: string) {
      const call = [...spy.mock.calls].reverse().find((c) => c[0] === title);
      if (!call) throw new Error(`No alert titled "${title}"; saw ${JSON.stringify(spy.mock.calls.map((c) => c[0]))}`);
      const b = (call[2] as AlertButton[] | undefined)?.find((x) => x.text === button);
      if (!b) throw new Error(`Alert "${title}" has no "${button}" button`);
      b.onPress?.();
    },
  };
}

export { screen };
