import {
  OfflineManager,
  type OfflinePack,
  type OfflinePackError,
  type OfflinePackStatus,
} from '@maplibre/maplibre-react-native';
import { useSyncExternalStore } from 'react';

import {
  Bounds,
  OFFLINE_WATER_ZOOM,
  OFFLINE_ZOOM,
  estimateDownload,
  samplePoints,
  tileRangeForBounds,
} from '../core/mapgeo';
import type { LatLng } from '../core/tiles';
import { t } from '../i18n';
import { boundaryFilesConfigured, prefetchBoundaries } from './boundaryFiles';
import { getMeta, setMeta } from './db';
import { MAP_STYLE_URL } from './mapStyle';
import { isOnline, onConnectivityChange } from './net';
import { water } from './water';

/**
 * Areas saved for use without signal. Each one is three downloads:
 *  - the basemap, as a MapLibre offline pack (stored by MapLibre itself);
 *  - water masks, so lakes and rivers stay unfogged (our SQLite cache);
 *  - the boundaries it spans: the boundary files for the area (cached, so
 *    regions are found there without signal) plus lookups of the regions
 *    at a few points in it via the store's queue.
 * Downloads resume by themselves when the app restarts or signal returns.
 */

export type OfflineAreaState = 'downloading' | 'waiting' | 'complete' | 'error';

export type OfflineArea = {
  id: string;
  name: string;
  bounds: Bounds;
  createdAt: number;
  state: OfflineAreaState;
  /** 0–1 across the map and water downloads. */
  progress: number;
  /** Bytes of map data downloaded so far. */
  bytes: number;
  error: string | null;
};

type PackMetadata = { name: string; createdAt: number };

type Entry = {
  area: OfflineArea;
  map: { done: number; total: number; complete: boolean };
  water: { done: number; total: number; complete: boolean; running: boolean };
  boundaries: { complete: boolean; running: boolean };
};

/** Default MapLibre cache for map tiles you've looked at, on top of saved areas. */
const AMBIENT_CACHE_BYTES = 256 * 1024 * 1024;
const WATER_BATCH = 16;
const waterDoneKey = (id: string) => `offlineWaterDone:${id}`;
const boundariesDoneKey = (id: string) => `offlineBoundariesDone:${id}`;

class OfflineAreas {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private version = 0;
  private started: Promise<void> | null = null;
  /** Set when this build has no MapLibre native code (e.g. Expo Go). */
  unavailable: string | null = null;
  /** Hook for queuing boundary lookups, set by the store (avoids an import cycle). */
  queueLookups: (points: LatLng[]) => void = () => {};

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  get list(): OfflineArea[] {
    return [...this.entries.values()].map((e) => e.area).sort((a, b) => b.createdAt - a.createdAt);
  }

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  /** Loads saved areas and resumes unfinished downloads. Safe to call more than once. */
  start(): Promise<void> {
    this.started ??= this.load().catch((e) => {
      this.unavailable = e instanceof Error ? e.message : String(e);
      this.emit();
    });
    return this.started;
  }

  private async load() {
    OfflineManager.setTileCountLimit(1_000_000);
    OfflineManager.setProgressEventThrottle(750);
    await OfflineManager.setMaximumAmbientCacheSize(AMBIENT_CACHE_BYTES);
    for (const pack of await OfflineManager.getPacks()) {
      const meta = pack.metadata as Partial<PackMetadata>;
      const entry = this.track(pack.id, meta.name ?? t('offline.defaultName'), pack.bounds, meta.createdAt ?? 0);
      entry.water.complete = (await getMeta<boolean>(waterDoneKey(pack.id))) === true;
      entry.boundaries.complete = (await getMeta<boolean>(boundariesDoneKey(pack.id))) === true;
      this.applyStatus(entry, await pack.status());
      if (!entry.map.complete) await this.watch(pack, true);
      this.downloadWater(entry);
      this.downloadBoundaries(entry);
    }
    onConnectivityChange((online) => {
      if (online) void this.resumeAll();
    });
    this.emit();
  }

  /** Starts saving an area. The download carries on in the background. */
  async save(name: string, bounds: Bounds): Promise<void> {
    await this.start();
    if (this.unavailable) throw new Error(t('save.needsDevBuild'));
    if (estimateDownload(bounds).tooBig) throw new Error(t('save.tooBig'));
    const createdAt = Date.now();
    const pack = await OfflineManager.createPack(
      {
        mapStyle: MAP_STYLE_URL,
        bounds,
        minZoom: OFFLINE_ZOOM.min,
        maxZoom: OFFLINE_ZOOM.max,
        metadata: { name, createdAt } satisfies PackMetadata,
      },
      (p, status) => this.onProgress(p.id, status),
      (p, error) => this.onError(p.id, error),
    );
    const entry = this.track(pack.id, name, bounds, createdAt);
    this.emit();
    this.downloadWater(entry);
    this.downloadBoundaries(entry);
    this.queueLookups(samplePoints(bounds));
  }

  async remove(id: string): Promise<void> {
    OfflineManager.removeListener(id);
    await OfflineManager.deletePack(id);
    await setMeta(waterDoneKey(id), false);
    await setMeta(boundariesDoneKey(id), false);
    this.entries.delete(id);
    this.emit();
  }

  /** Retries everything unfinished, e.g. when signal comes back. */
  async resumeAll(): Promise<void> {
    if (this.unavailable || !this.started) return;
    await this.started;
    for (const entry of this.entries.values()) {
      if (entry.area.state === 'error') entry.area.error = null;
      if (!entry.map.complete) {
        const pack = await OfflineManager.getPack(entry.area.id).catch(() => null);
        if (pack) await this.watch(pack, true);
      }
      this.downloadWater(entry);
      this.downloadBoundaries(entry);
    }
    this.emit();
  }

  private track(id: string, name: string, bounds: Bounds, createdAt: number): Entry {
    const entry: Entry = {
      area: { id, name, bounds, createdAt, state: 'downloading', progress: 0, bytes: 0, error: null },
      map: { done: 0, total: estimateDownload(bounds).mapTiles, complete: false },
      water: { done: 0, total: estimateDownload(bounds).waterTiles, complete: false, running: false },
      // Without boundary files (development) there's nothing to download.
      boundaries: { complete: !boundaryFilesConfigured, running: false },
    };
    this.entries.set(id, entry);
    return entry;
  }

  private async watch(pack: OfflinePack, resume: boolean) {
    await OfflineManager.addListener(
      pack.id,
      (p, status) => this.onProgress(p.id, status),
      (p, error) => this.onError(p.id, error),
    );
    if (resume && isOnline()) await pack.resume().catch(() => undefined);
  }

  private onProgress(id: string, status: OfflinePackStatus) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.applyStatus(entry, status);
    this.emit();
  }

  private onError(id: string, error: OfflinePackError) {
    const entry = this.entries.get(id);
    if (!entry) return;
    // Connection problems clear up on their own; MapLibre retries the download.
    if (!isOnline()) return;
    entry.area.error = error.message;
    this.refresh(entry);
    this.emit();
  }

  private applyStatus(entry: Entry, status: OfflinePackStatus) {
    entry.map.total = Math.max(1, status.requiredResourceCount);
    entry.map.done = status.completedResourceCount;
    entry.map.complete = status.state === 'complete' || status.percentage >= 100;
    entry.area.bytes = status.completedResourceSize;
    this.refresh(entry, status.state === 'active');
  }

  private refresh(entry: Entry, mapActive = false) {
    const { map, water: w, boundaries: b, area } = entry;
    const done = (map.complete ? map.total : map.done) + (w.complete ? w.total : w.done);
    area.progress = Math.min(1, done / Math.max(1, map.total + w.total));
    area.state =
      map.complete && w.complete && b.complete
        ? 'complete'
        : area.error
          ? 'error'
          : mapActive || w.running || b.running
            ? 'downloading'
            : 'waiting';
  }

  /** Fetches the area's boundary files; already-cached files are instant. */
  private downloadBoundaries(entry: Entry) {
    const b = entry.boundaries;
    if (b.complete || b.running) return;
    b.running = true;
    this.refresh(entry);
    void prefetchBoundaries(entry.area.bounds)
      .then(async () => {
        b.complete = true;
        await setMeta(boundariesDoneKey(entry.area.id), true);
      })
      .catch(() => undefined) // Retried when signal returns or the app restarts.
      .finally(() => {
        b.running = false;
        this.refresh(entry);
        this.emit();
      });
  }

  /** Fetches water for the area, a batch at a time; already-cached tiles are instant. */
  private downloadWater(entry: Entry) {
    const w = entry.water;
    if (w.complete || w.running) return;
    w.running = true;
    const tiles: { z: number; x: number; y: number }[] = [];
    for (let z = OFFLINE_WATER_ZOOM.min; z <= OFFLINE_WATER_ZOOM.max; z++) {
      const r = tileRangeForBounds(entry.area.bounds, z);
      for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) tiles.push({ z, x, y });
    }
    w.total = tiles.length;
    w.done = 0;
    this.refresh(entry);

    void (async () => {
      let failed = 0;
      for (let i = 0; i < tiles.length && this.entries.has(entry.area.id); i += WATER_BATCH) {
        const batch = tiles.slice(i, i + WATER_BATCH);
        const results = await Promise.allSettled(
          batch.map(({ z, x, y }) => water.ensure({ z, x0: x, x1: x, y0: y, y1: y })),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') w.done++;
          else failed++;
        }
        this.refresh(entry);
        this.emit();
        // No signal: stop here and pick up again when it returns.
        if (failed > 0 && !isOnline()) break;
      }
      w.running = false;
      w.complete = failed === 0 && w.done === w.total;
      if (w.complete) await setMeta(waterDoneKey(entry.area.id), true);
      this.refresh(entry);
      this.emit();
    })();
  }
}

export const offlineAreas = new OfflineAreas();

/** Re-renders the component whenever saved areas change. */
export function useOfflineAreas(): OfflineArea[] {
  useSyncExternalStore(offlineAreas.subscribe, offlineAreas.getVersion);
  return offlineAreas.list;
}
