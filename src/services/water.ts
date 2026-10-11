import { inflate } from 'pako';

import { TileRange, WaterLookup, WaterMask, makeWaterLookup, maskFromTile } from '../core/water';
import { loadWaterMask, saveWaterMask } from './db';

/**
 * Downloads and caches water masks. Tiles come from OpenFreeMap, a free,
 * key-less host of OpenStreetMap vector tiles in the OpenMapTiles schema.
 * Each tile is fetched once and kept in SQLite: water rarely moves.
 */
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const MAX_PARALLEL = 4;
const RETRY_AFTER_MS = 60_000;

const tileId = (z: number, x: number, y: number) => `${z}/${x}/${y}`;

class WaterService {
  private masks = new Map<string, WaterMask>();
  private inflight = new Map<string, Promise<void>>();
  private failedAt = new Map<string, number>();
  private tileTemplate: Promise<string> | null = null;
  private active = 0;
  private waiting: (() => void)[] = [];
  private listeners = new Set<() => void>();

  /** Synchronous lookup over whatever has loaded so far. */
  lookup: WaterLookup = makeWaterLookup((z, x, y) => this.masks.get(tileId(z, x, y)));

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  has(range: TileRange): boolean {
    for (let x = range.x0; x <= range.x1; x++) {
      for (let y = range.y0; y <= range.y1; y++) if (!this.masks.has(tileId(range.z, x, y))) return false;
    }
    return true;
  }

  /** Loads every tile in the range (from cache or network). Rejects if any fail. */
  async ensure(range: TileRange): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (let x = range.x0; x <= range.x1; x++) {
      for (let y = range.y0; y <= range.y1; y++) jobs.push(this.load(range.z, x, y));
    }
    const results = await Promise.allSettled(jobs);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw (failed as PromiseRejectedResult).reason;
  }

  private load(z: number, x: number, y: number): Promise<void> {
    const id = tileId(z, x, y);
    if (this.masks.has(id)) return Promise.resolve();
    const existing = this.inflight.get(id);
    if (existing) return existing;
    const failed = this.failedAt.get(id);
    if (failed && Date.now() - failed < RETRY_AFTER_MS) {
      return Promise.reject(new Error('Water data unavailable (offline?)'));
    }

    const job = (async () => {
      let mask = await loadWaterMask(id);
      if (mask === undefined) {
        mask = await this.withSlot(() => this.fetchMask(z, x, y));
        await saveWaterMask(id, mask);
      }
      this.masks.set(id, mask);
      this.failedAt.delete(id);
      this.listeners.forEach((fn) => fn());
    })()
      .catch((e) => {
        this.failedAt.set(id, Date.now());
        throw e;
      })
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, job);
    return job;
  }

  private async fetchMask(z: number, x: number, y: number): Promise<WaterMask> {
    const template = await this.template();
    const res = await fetch(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    // Empty tiles have no features at all, so no water.
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new Error(`Water tile ${z}/${x}/${y} failed (${res.status})`);
    let data = new Uint8Array(await res.arrayBuffer());
    // Some hosts serve tiles gzipped without a Content-Encoding header.
    if (data[0] === 0x1f && data[1] === 0x8b) data = inflate(data);
    return data.length ? maskFromTile(data) : null;
  }

  private template(): Promise<string> {
    this.tileTemplate ??= fetch(TILEJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`Map data unavailable (${r.status})`);
        return r.json();
      })
      .then((j: { tiles?: string[] }) => {
        if (!j.tiles?.[0]) throw new Error('Map data has no tile URL');
        return j.tiles[0];
      })
      .catch((e) => {
        this.tileTemplate = null;
        throw e;
      });
    return this.tileTemplate;
  }

  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    while (this.active >= MAX_PARALLEL) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

export const water = new WaterService();
