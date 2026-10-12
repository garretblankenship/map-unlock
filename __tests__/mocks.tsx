/**
 * Stand-ins for native code that Jest can't run, set up before each test
 * file (see "jest" in package.json). Expo's own modules are already mocked by
 * jest-expo; this covers the rest and gives the app a real, empty database.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Each test file gets its own folder of database files, like a fresh install. */
const mockDbDir = mkdtempSync(join(tmpdir(), 'owl-screens-'));

jest.mock('expo-sqlite', () => require('../test/expoSqlite').forDirectory(() => mockDbDir));

/** The map draws nothing; children render so sources and layers are exercised. */
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Map = ({ children, onDidFinishLoadingStyle }: { children?: unknown; onDidFinishLoadingStyle?: () => void }) => {
    React.useEffect(() => onDidFinishLoadingStyle?.(), []);
    return <View testID="map">{children}</View>;
  };
  const Camera = React.forwardRef((_props: unknown, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ easeTo: jest.fn(), fitBounds: jest.fn() }));
    return null;
  });
  const GeoJSONSource = ({ id, children }: { id: string; children?: unknown }) => <View testID={`source-${id}`}>{children}</View>;
  return {
    Map,
    Camera,
    GeoJSONSource,
    Layer: () => null,
    NativeUserLocation: () => null,
    OfflineManager: require('./fakeOfflineManager').fakeOfflineManager,
  };
});

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///card.png') }));

// The app updates itself asynchronously (database reads, GPS), outside any
// act() a test could wrap it in; React's reminders about that are just noise here.
const consoleError = console.error;
const ACT_NOISE = /not wrapped in act|not configured to support act/;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && ACT_NOISE.test(args[0])) return;
  consoleError(...args);
};

// No network in tests: every request fails as if there were no signal.
global.fetch = jest.fn(async () => {
  throw new TypeError('Network request failed');
}) as unknown as typeof fetch;

type MockListener = (state: unknown) => void;

/** The phone starts with no signal; a test can change that with mockSet(online). */
jest.mock('expo-network', () => {
  const listeners = new Set<MockListener>();
  let state = { isConnected: false, isInternetReachable: false };
  return {
    getNetworkStateAsync: async () => state,
    addNetworkStateListener: (fn: MockListener) => {
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
    mockSet(online: boolean) {
      state = { isConnected: online, isInternetReachable: online };
      listeners.forEach((fn) => fn(state));
    },
  };
});

type MockWatcher = (location: unknown) => void;

/**
 * GPS and location permissions. "While Using" is granted, "Always" isn't yet.
 * Tests move the phone with mockMoveTo() and change permissions with
 * mockSetPermissions() (see helpers.tsx).
 */
jest.mock('expo-location', () => {
  const watchers = new Set<MockWatcher>();
  const allowed = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
  const notYet = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
  const permissions = { foreground: allowed, background: notYet };
  let started = false;
  return {
    Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
    ActivityType: { Other: 1, AutomotiveNavigation: 2, Fitness: 3, OtherNavigation: 4, Airborne: 5 },
    getForegroundPermissionsAsync: jest.fn(async () => permissions.foreground),
    requestForegroundPermissionsAsync: jest.fn(async () => permissions.foreground),
    getBackgroundPermissionsAsync: jest.fn(async () => permissions.background),
    requestBackgroundPermissionsAsync: jest.fn(async () => permissions.background),
    isBackgroundLocationAvailableAsync: jest.fn(async () => true),
    watchPositionAsync: jest.fn(async (_options: unknown, onLocation: MockWatcher) => {
      watchers.add(onLocation);
      return { remove: () => watchers.delete(onLocation) };
    }),
    startLocationUpdatesAsync: jest.fn(async () => {
      started = true;
    }),
    stopLocationUpdatesAsync: jest.fn(async () => {
      started = false;
    }),
    hasStartedLocationUpdatesAsync: jest.fn(async () => started),
    mockMoveTo(latitude: number, longitude: number) {
      const location = {
        timestamp: Date.now(),
        coords: { latitude, longitude, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: 1 },
      };
      watchers.forEach((fn) => fn(location));
    },
    mockSetPermissions(foreground: 'granted' | 'ask' | 'blocked', background: 'granted' | 'ask' | 'blocked') {
      const state = (s: string) =>
        s === 'granted' ? allowed : s === 'ask' ? notYet : { ...notYet, status: 'denied', canAskAgain: false };
      permissions.foreground = state(foreground);
      permissions.background = state(background);
    },
  };
});
