/**
 * The app's database code (src/services/db.ts) against a real SQLite engine:
 * multi-row inserts, migrations of databases written by earlier versions,
 * the indexes the queries rely on, and the progress/cache split.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RegionRecord } from '../src/core/regions';

const state = vi.hoisted(() => ({ dir: '' }));

vi.mock('expo-sqlite', async () => (await import('./expoSqlite')).forDirectory(() => state.dir));

type Db = typeof import('../src/services/db');

/** A fresh copy of the db module, as if the app had just started. */
async function launch(): Promise<Db> {
  vi.resetModules();
  return import('../src/services/db');
}

/** Opens one of the app's database files directly, to inspect or prepare it. */
function raw(name: string): DatabaseSync {
  return new DatabaseSync(join(state.dir, name));
}

function tables(d: DatabaseSync): string[] {
  return d
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name as string);
}

const square: RegionRecord['geometry'] = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  ],
};

function region(id: string, createdAt: number, totalCells?: number): RegionRecord {
  return { id, name: id, displayName: `${id}, Somewhere`, level: 'city', geometry: square, createdAt, totalCells };
}

beforeEach(() => {
  state.dir = mkdtempSync(join(tmpdir(), 'owl-db-'));
});

afterEach(() => {
  rmSync(state.dir, { recursive: true, force: true });
});

describe('a new install', () => {
  it('creates progress and cache tables in separate files', async () => {
    const db = await launch();
    db.getDb();
    db.getCacheDb();
    expect(tables(raw(db.PROGRESS_DB))).toEqual(['cells', 'meta', 'regions']);
    expect(tables(raw(db.CACHE_DB))).toEqual(['boundary_files', 'water']);
  });

  it('uses write-ahead logging (the backup rules include the -wal file)', async () => {
    const db = await launch();
    expect(db.getDb().getFirstSync<{ journal_mode: string }>('PRAGMA journal_mode')?.journal_mode).toBe('wal');
  });
});

describe('cells', () => {
  it('saves thousands of cells in multi-row inserts and reads them back', async () => {
    const db = await launch();
    const keys = Array.from({ length: 2501 }, (_, i) => 1_000_000_000_000 + i * 7919);
    expect(await db.saveCells(keys)).toEqual(keys);
    expect((await db.loadCells()).sort((a, b) => a - b)).toEqual(keys);
  });

  it('keeps cell keys as exact integers', async () => {
    const db = await launch();
    const big = Number.MAX_SAFE_INTEGER - 1;
    await db.saveCells([big]);
    expect(await db.loadCells()).toEqual([big]);
  });

  it('ignores cells that are already saved and keeps their first unlock time', async () => {
    const db = await launch();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1000);
      await db.saveCells([1, 2, 3]);
      vi.setSystemTime(2000);
      await db.saveCells([3, 4]);
    } finally {
      vi.useRealTimers();
    }
    expect((await db.loadCells()).sort()).toEqual([1, 2, 3, 4]);
    expect((await db.loadCellsSince(2000)).sort()).toEqual([4]);
    expect((await db.loadCellsSince(1000)).sort()).toEqual([1, 2, 3, 4]);
  });

  it('skips cells the caller already knows without touching the database', async () => {
    const db = await launch();
    expect(await db.saveCells([1, 2, 3], new Set([2]))).toEqual([1, 3]);
    expect((await db.loadCells()).sort()).toEqual([1, 3]);
    expect(await db.saveCells([1, 3], new Set([1, 3]))).toEqual([]);
  });

  it('finds recent cells through the time index, not a full scan', async () => {
    const db = await launch();
    const plan = db
      .getDb()
      .getAllSync<{ detail: string }>('EXPLAIN QUERY PLAN SELECT key FROM cells WHERE unlocked_at >= ?', 0)
      .map((r) => r.detail)
      .join('\n');
    expect(plan).toContain('cells_by_time');
    expect(plan).not.toMatch(/SCAN cells\b(?! USING)/);
  });
});

describe('regions', () => {
  it('round-trips a region, its outline and its cached cell total', async () => {
    const db = await launch();
    await db.saveRegion(region('b', 2));
    await db.saveRegion(region('a', 1, 500));
    const [a, b] = await db.loadRegions();
    expect(a).toEqual(region('a', 1, 500));
    expect(b).toEqual(region('b', 2));
    expect(b.totalCells).toBeUndefined();

    await db.saveRegionTotal('b', 42);
    expect((await db.loadRegions())[1].totalCells).toBe(42);

    await db.deleteRegion('a');
    expect((await db.loadRegions()).map((r) => r.id)).toEqual(['b']);
  });

  it('replaces a region saved again under the same id', async () => {
    const db = await launch();
    await db.saveRegion(region('a', 1));
    await db.saveRegion({ ...region('a', 1, 9), displayName: 'Renamed' });
    expect(await db.loadRegions()).toEqual([{ ...region('a', 1, 9), displayName: 'Renamed' }]);
  });
});

describe('water masks and boundary files (cache database)', () => {
  it('tell never fetched (undefined) from all land (null) from a mask', async () => {
    const db = await launch();
    const mask = new Uint8Array([0, 1, 255, 7]);
    expect(await db.loadWaterMask('12/1/2')).toBeUndefined();
    await db.saveWaterMask('12/1/2', null);
    await db.saveWaterMask('12/1/3', mask);
    expect(await db.loadWaterMask('12/1/2')).toBeNull();
    expect(await db.loadWaterMask('12/1/3')).toEqual(mask);
    expect(raw(db.PROGRESS_DB).prepare("SELECT name FROM sqlite_master WHERE name = 'water'").get()).toBeUndefined();
  });

  it('cache boundary files, including "the server had none"', async () => {
    const db = await launch();
    expect(await db.loadBoundaryFile('https://x/a.json')).toBeUndefined();
    await db.saveBoundaryFile('https://x/a.json', '{"v":1}');
    await db.saveBoundaryFile('https://x/b.json', null);
    expect(await db.loadBoundaryFile('https://x/a.json')).toBe('{"v":1}');
    expect(await db.loadBoundaryFile('https://x/b.json')).toBeNull();
  });
});

describe('meta', () => {
  it('stores JSON values and remembers the last fix across launches', async () => {
    let db = await launch();
    const fix = { latitude: 51.5, longitude: -0.12, timestamp: 1234 };
    await db.setMeta('settings', { units: 'metric' });
    await db.setLastFix(fix);
    db = await launch();
    expect(await db.getMeta('settings')).toEqual({ units: 'metric' });
    expect(await db.getLastFix()).toEqual(fix);
    expect(await db.getMeta('missing')).toBeNull();
  });

  it('serializes concurrent changes to the pending places', async () => {
    const db = await launch();
    const adds = Array.from({ length: 10 }, (_, i) =>
      db.updatePendingPlaces((l) => [...l, { latitude: i, longitude: i }]),
    );
    await Promise.all(adds);
    expect((await db.getMeta<unknown[]>('pendingPlaces'))?.length).toBe(10);
  });

  it('a reset clears progress but keeps settings and the cache', async () => {
    const db = await launch();
    await db.saveCells([1, 2]);
    await db.saveRegion(region('a', 1));
    await db.setMeta('settings', { units: 'imperial' });
    await db.setLastFix({ latitude: 1, longitude: 2, timestamp: 3 });
    await db.saveWaterMask('t', null);
    await db.resetAll();
    expect(await db.loadCells()).toEqual([]);
    expect(await db.loadRegions()).toEqual([]);
    expect(await db.getLastFix()).toBeNull();
    expect(await db.getMeta('settings')).toEqual({ units: 'imperial' });
    expect(await db.loadWaterMask('t')).toBeNull();
  });
});

describe('upgrading a database from the first release', () => {
  /** The progress database as the first release left it: no cell index, no cell totals, water inside. */
  function firstReleaseDb(name: string) {
    const d = raw(name);
    d.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE cells (key INTEGER PRIMARY KEY NOT NULL, unlocked_at INTEGER NOT NULL);
      CREATE TABLE regions (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        level TEXT NOT NULL,
        geometry TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE meta (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);
      CREATE TABLE water (tile TEXT PRIMARY KEY NOT NULL, mask BLOB, fetched_at INTEGER NOT NULL);
      INSERT INTO cells VALUES (10, 100), (11, 200);
      INSERT INTO regions VALUES ('r1', 'Town', 'Town, County', 'city', '${JSON.stringify(square)}', 5);
      INSERT INTO meta VALUES ('settings', '{"units":"metric"}');
      INSERT INTO water VALUES ('14/1/1', NULL, 7);
      INSERT INTO water VALUES ('14/1/2', x'00ff10', 8);
      INSERT INTO water VALUES ('14/1/3', x'01', 9);
    `);
    d.close();
  }

  it('keeps progress, adds the cell index and totals column, and moves water to the cache', async () => {
    const before = await launch();
    firstReleaseDb(before.PROGRESS_DB);
    // A newer mask already in the cache wins over the old copy.
    const cache = raw(before.CACHE_DB);
    cache.exec(`CREATE TABLE water (tile TEXT PRIMARY KEY NOT NULL, mask BLOB, fetched_at INTEGER NOT NULL);
      INSERT INTO water VALUES ('14/1/3', x'02', 99);`);
    cache.close();

    const db = await launch();
    expect((await db.loadCells()).sort()).toEqual([10, 11]);
    expect(await db.loadCellsSince(150)).toEqual([11]);
    expect(await db.loadRegions()).toEqual([region('r1', 5)].map((r) => ({ ...r, name: 'Town', displayName: 'Town, County' })));
    expect(await db.getMeta('settings')).toEqual({ units: 'metric' });

    const progress = raw(db.PROGRESS_DB);
    expect(tables(progress)).toEqual(['cells', 'meta', 'regions']);
    expect(progress.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'cells_by_time'").get()).toBeTruthy();
    expect(progress.prepare('PRAGMA table_info(regions)').all().map((c) => c.name)).toContain('total_cells');

    expect(await db.loadWaterMask('14/1/1')).toBeNull();
    expect(await db.loadWaterMask('14/1/2')).toEqual(new Uint8Array([0x00, 0xff, 0x10]));
    expect(await db.loadWaterMask('14/1/3')).toEqual(new Uint8Array([0x02]));

    await db.saveRegionTotal('r1', 77);
    expect((await db.loadRegions())[0].totalCells).toBe(77);
  });

  it('opens cleanly again after upgrading', async () => {
    const first = await launch();
    firstReleaseDb(first.PROGRESS_DB);
    first.getDb();
    const db = await launch();
    db.getDb();
    expect(await db.loadWaterMask('14/1/2')).toEqual(new Uint8Array([0x00, 0xff, 0x10]));
    expect((await db.loadCells()).sort()).toEqual([10, 11]);
  });

  it('can read the water cache first, before anything opened the progress database', async () => {
    const before = await launch();
    firstReleaseDb(before.PROGRESS_DB);
    const db = await launch();
    expect(await db.loadWaterMask('14/1/2')).toEqual(new Uint8Array([0x00, 0xff, 0x10]));
  });
});
