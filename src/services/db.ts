import * as SQLite from 'expo-sqlite';

import type { Fix } from '../core/reveal';
import type { RegionRecord } from '../core/regions';
import type { LatLng } from '../core/tiles';

/**
 * Local persistence. Everything stays on the device, in two databases:
 *
 * PROGRESS_DB, the player's progress. It's included in the phone's backups
 * (iCloud, and Google via plugins/with-backup-rules.js), so keep it small:
 *  - cells:   every unlocked base-zoom cell
 *  - regions: boundaries the user has discovered
 *  - meta:    small key/value state (last GPS fix, places to look up, settings)
 *
 * CACHE_DB, data that can be downloaded again, left out of Android backups
 * (whose 25 MB limit would otherwise be at risk):
 *  - water:          cached water masks per map tile (see core/water.ts)
 *  - boundary_files: downloaded boundary tiles and regions, by URL
 */
export const PROGRESS_DB = 'mapunlock.db';
export const CACHE_DB = 'cache.db';

let db: SQLite.SQLiteDatabase | null = null;
let cacheDb: SQLite.SQLiteDatabase | null = null;

export function getCacheDb(): SQLite.SQLiteDatabase {
  if (cacheDb) return cacheDb;
  cacheDb = SQLite.openDatabaseSync(CACHE_DB);
  cacheDb.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS water (tile TEXT PRIMARY KEY NOT NULL, mask BLOB, fetched_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS boundary_files (url TEXT PRIMARY KEY NOT NULL, body TEXT, fetched_at INTEGER NOT NULL);
  `);
  return cacheDb;
}

/** Earlier versions kept the water cache in the progress database; move it out. */
function moveWaterToCache(progress: SQLite.SQLiteDatabase) {
  const old = progress.getFirstSync<{ n: number }>(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'water'",
  );
  if (!old?.n) return;
  const cache = getCacheDb();
  const rows = progress.getAllSync<{ tile: string; mask: Uint8Array | null; fetched_at: number }>(
    'SELECT tile, mask, fetched_at FROM water',
  );
  cache.withTransactionSync(() => {
    for (const r of rows) {
      cache.runSync('INSERT OR IGNORE INTO water (tile, mask, fetched_at) VALUES (?, ?, ?)', r.tile, r.mask, r.fetched_at);
    }
  });
  progress.execSync('DROP TABLE water; VACUUM;');
}

export function getDb(): SQLite.SQLiteDatabase {
  if (db) return db;
  db = SQLite.openDatabaseSync(PROGRESS_DB);
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS cells (key INTEGER PRIMARY KEY NOT NULL, unlocked_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      level TEXT NOT NULL,
      geometry TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);
  `);
  moveWaterToCache(db);
  return db;
}

export async function loadCells(): Promise<number[]> {
  const rows = await getDb().getAllAsync<{ key: number }>('SELECT key FROM cells');
  return rows.map((r) => r.key);
}

/** Inserts cells, returning only the ones that weren't already unlocked. */
export async function saveCells(keys: number[], known?: Set<number>): Promise<number[]> {
  const fresh = known ? keys.filter((k) => !known.has(k)) : keys;
  if (fresh.length === 0) return [];
  const d = getDb();
  const added: number[] = [];
  await d.withTransactionAsync(async () => {
    const stmt = await d.prepareAsync('INSERT OR IGNORE INTO cells (key, unlocked_at) VALUES (?, ?)');
    try {
      const now = Date.now();
      for (const k of fresh) {
        const res = await stmt.executeAsync(k, now);
        if (res.changes > 0) added.push(k);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
  return added;
}

export async function loadRegions(): Promise<RegionRecord[]> {
  const rows = await getDb().getAllAsync<{
    id: string;
    name: string;
    display_name: string;
    level: RegionRecord['level'];
    geometry: string;
    created_at: number;
  }>('SELECT * FROM regions ORDER BY created_at');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    level: r.level,
    geometry: JSON.parse(r.geometry),
    createdAt: r.created_at,
  }));
}

export async function saveRegion(r: RegionRecord): Promise<void> {
  await getDb().runAsync(
    'INSERT OR REPLACE INTO regions (id, name, display_name, level, geometry, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    r.id,
    r.name,
    r.displayName,
    r.level,
    JSON.stringify(r.geometry),
    r.createdAt,
  );
}

export async function deleteRegion(id: string): Promise<void> {
  await getDb().runAsync('DELETE FROM regions WHERE id = ?', id);
}

/** Cached water mask for a tile: undefined if never fetched, null if all land. */
/** The water cache, after any move out of the progress database has happened. */
function waterDb(): SQLite.SQLiteDatabase {
  getDb();
  return getCacheDb();
}

export async function loadWaterMask(tile: string): Promise<Uint8Array | null | undefined> {
  const row = await waterDb().getFirstAsync<{ mask: Uint8Array | null }>('SELECT mask FROM water WHERE tile = ?', tile);
  return row ? row.mask : undefined;
}

export async function saveWaterMask(tile: string, mask: Uint8Array | null): Promise<void> {
  await waterDb().runAsync(
    'INSERT OR REPLACE INTO water (tile, mask, fetched_at) VALUES (?, ?, ?)',
    tile,
    mask,
    Date.now(),
  );
}

export async function getMeta<T>(k: string): Promise<T | null> {
  const row = await getDb().getFirstAsync<{ v: string }>('SELECT v FROM meta WHERE k = ?', k);
  return row ? (JSON.parse(row.v) as T) : null;
}

export async function setMeta(k: string, v: unknown): Promise<void> {
  await getDb().runAsync('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, JSON.stringify(v));
}

export async function getLastFix(): Promise<Fix | null> {
  return getMeta<Fix>('lastFix');
}

export async function setLastFix(fix: Fix): Promise<void> {
  await setMeta('lastFix', fix);
}

export async function resetAll(): Promise<void> {
  // Settings survive a reset; everything else about progress goes.
  await getDb().execAsync("DELETE FROM cells; DELETE FROM regions; DELETE FROM meta WHERE k != 'settings';");
}

let pendingQueue: Promise<unknown> = Promise.resolve();

/**
 * Read-modify-write of the places waiting for a boundary lookup, serialized
 * so the background task and the UI can't overwrite each other's changes.
 */
export function updatePendingPlaces(fn: (list: LatLng[]) => LatLng[]): Promise<LatLng[]> {
  const run = pendingQueue.then(async () => {
    const before = (await getMeta<LatLng[]>('pendingPlaces')) ?? [];
    const after = fn(before);
    if (after !== before) await setMeta('pendingPlaces', after);
    return after;
  });
  pendingQueue = run.catch(() => undefined);
  return run;
}

/** A cached boundary file: undefined if never fetched, null if the server had none (404). */
export async function loadBoundaryFile(url: string): Promise<string | null | undefined> {
  const row = await getCacheDb().getFirstAsync<{ body: string | null }>('SELECT body FROM boundary_files WHERE url = ?', url);
  return row ? row.body : undefined;
}

export async function saveBoundaryFile(url: string, body: string | null): Promise<void> {
  await getCacheDb().runAsync(
    'INSERT OR REPLACE INTO boundary_files (url, body, fetched_at) VALUES (?, ?, ?)',
    url,
    body,
    Date.now(),
  );
}
