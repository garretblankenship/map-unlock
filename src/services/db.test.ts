import { describe, expect, it, vi } from 'vitest';

import { getLastFix, saveCells, setLastFix } from './db';

const calls = vi.hoisted(() => ({ run: [] as { sql: string; params: unknown[] }[], meta: new Map<string, string>() }));

vi.mock('expo-sqlite', () => {
  const db = {
    execSync: () => undefined,
    getFirstSync: () => ({ n: 0 }),
    getAllSync: () => [{ name: 'total_cells' }],
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    runAsync: async (sql: string, ...rest: unknown[]) => {
      const params = Array.isArray(rest[0]) ? rest[0] : rest;
      calls.run.push({ sql, params });
      if (sql.startsWith('INSERT OR REPLACE INTO meta')) calls.meta.set(params[0] as string, params[1] as string);
      return { changes: 1 };
    },
    getFirstAsync: async (_sql: string, k: string) => (calls.meta.has(k) ? { v: calls.meta.get(k) } : null),
  };
  return { openDatabaseSync: () => db };
});

describe('saveCells', () => {
  it('skips known cells and inserts the rest in a few statements', async () => {
    calls.run.length = 0;
    const keys = Array.from({ length: 1000 }, (_, i) => i);
    const added = await saveCells(keys, new Set([0, 1, 2]));
    expect(added).toHaveLength(997);
    const inserts = calls.run.filter((c) => c.sql.startsWith('INSERT OR IGNORE INTO cells'));
    expect(inserts).toHaveLength(3); // 400 + 400 + 197 rows
    expect(inserts.reduce((n, c) => n + c.params.length, 0)).toBe(997 * 2);
  });

  it('does nothing when every cell is already unlocked', async () => {
    calls.run.length = 0;
    expect(await saveCells([5, 6], new Set([5, 6]))).toEqual([]);
    expect(calls.run).toHaveLength(0);
  });
});

describe('last fix', () => {
  it('is kept in memory after the first read', async () => {
    const fix = { latitude: 1, longitude: 2, timestamp: 3 };
    await setLastFix(fix);
    calls.meta.clear(); // a read from the database would now find nothing
    expect(await getLastFix()).toEqual(fix);
  });
});
