import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegionRecord } from '../core/regions';
import { store } from './store';

// vi.mock calls below are hoisted above the imports by vitest.

const h = vi.hoisted(() => ({
  meta: new Map<string, unknown>(),
  records: [] as RegionRecord[],
  cells: [] as number[],
  lookups: [] as string[],
  savedTotals: new Map<string, number>(),
}));

vi.mock('expo-localization', () => ({ getLocales: () => [] }));
vi.mock('expo-network', () => ({}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('../services/offlineAreas', () => ({ offlineAreas: {} }));
vi.mock('../services/water', () => ({
  water: { onChange: () => undefined, lookup: () => false, ensure: async () => undefined, has: () => true, retryFailed: () => undefined },
}));
vi.mock('../services/db', () => ({
  loadCells: async () => h.cells,
  loadCellsSince: async () => [],
  loadRegions: async () => h.records,
  saveRegion: async () => undefined,
  saveRegionTotal: async (id: string, n: number) => void h.savedTotals.set(id, n),
  getMeta: async (k: string) => h.meta.get(k) ?? null,
  setMeta: async (k: string, v: unknown) => void h.meta.set(k, v),
  updatePendingPlaces: async (fn: (l: unknown[]) => unknown[]) => {
    const next = fn((h.meta.get('p') as unknown[]) ?? []);
    h.meta.set('p', next);
    return next;
  },
  resetAll: async () => undefined,
}));
vi.mock('../services/boundaries', () => ({
  regionsAt: async (lat: number, lon: number) => {
    h.lookups.push(`${lat.toFixed(4)},${lon.toFixed(4)}`);
    return { regions: [] };
  },
}));


const square = (lat: number, lon: number, d: number): RegionRecord['geometry'] => ({
  type: 'Polygon',
  coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]],
});

beforeEach(() => {
  h.lookups.length = 0;
});

describe('store startup', () => {
  it('shows the map before regions finish loading, then loads them', async () => {
    h.records = [
      { id: 'R1', name: 'Town', displayName: 'Town', level: 'city', geometry: square(47.6, -122.3, 0.05), createdAt: 1 },
      { id: 'R2', name: 'County', displayName: 'County', level: 'county', geometry: square(47.6, -122.3, 0.3), createdAt: 2, totalCells: 123 },
    ];
    const seen: { ready: boolean; loading: boolean; regions: number }[] = [];
    const unsub = store.subscribe(() => seen.push({ ready: store.ready, loading: store.regionsLoading, regions: store.regions.length }));
    await store.load();
    unsub();
    expect(seen[0]).toEqual({ ready: true, loading: true, regions: 0 });
    expect(seen.at(-1)).toEqual({ ready: true, loading: false, regions: 2 });
    // The stored total is reused; the missing one is computed once and saved.
    expect(store.regions.find((r) => r.id === 'R2')!.totalCells).toBe(123);
    expect(h.savedTotals.has('R1')).toBe(true);
    expect(h.savedTotals.has('R2')).toBe(false);
  });
});

describe('position updates', () => {
  it('re-renders only after a few metres and checks coverage every 50 m', async () => {
    let renders = 0;
    const unsub = store.subscribe(() => renders++);
    const base = { latitude: 48.5, longitude: -121 }; // outside every region: lookups get queued
    const north = (m: number) => ({ ...base, latitude: base.latitude + m / 111_195 });
    store.setPosition(base);
    const afterFirst = renders;
    store.setPosition(north(1)); // GPS jitter
    store.setPosition(north(2));
    expect(renders).toBe(afterFirst);
    store.setPosition(north(20)); // moved: re-render, but coverage was checked 20 m ago
    expect(renders).toBeGreaterThan(afterFirst);
    unsub();
    await new Promise((r) => setTimeout(r, 0));
    const lookupsBefore = h.lookups.length;
    store.setPosition(north(30));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.lookups.length).toBe(lookupsBefore);
  });
});
