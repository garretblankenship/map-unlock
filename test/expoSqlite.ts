/**
 * Enough of expo-sqlite for the app's database code, backed by a real SQLite
 * engine (Node's built-in node:sqlite), so SQL is tested for real rather than
 * against a mock. Mirrors expo-sqlite's semantics where the app relies on
 * them: variadic or array parameters, booleans bound as 0/1, BLOBs read back
 * as Uint8Array, and withTransaction* as plain BEGIN/COMMIT/ROLLBACK.
 *
 * Use with vi.mock, pointing databases at a directory (a phone keeps each app's
 * databases in one folder):
 *
 *   vi.mock('expo-sqlite', async () => (await import('./expoSqlite')).forDirectory(() => dir));
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { join } from 'node:path';

type BindValue = string | number | null | boolean | Uint8Array;

function bind(params: unknown[]): SQLInputValue[] {
  const list = params.length === 1 && Array.isArray(params[0]) ? (params[0] as BindValue[]) : (params as BindValue[]);
  return list.map((v) => (typeof v === 'boolean' ? Number(v) : v));
}

/** Async calls on a phone run on a native thread; yielding lets other work interleave like it would there. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export class ShimDatabase {
  readonly db: DatabaseSync;

  constructor(readonly databasePath: string) {
    this.db = new DatabaseSync(databasePath);
  }

  execSync(source: string): void {
    this.db.exec(source);
  }

  runSync(source: string, ...params: unknown[]) {
    const r = this.db.prepare(source).run(...bind(params));
    return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
  }

  getFirstSync<T>(source: string, ...params: unknown[]): T | null {
    const row = this.db.prepare(source).get(...bind(params));
    return row ? ({ ...row } as T) : null;
  }

  getAllSync<T>(source: string, ...params: unknown[]): T[] {
    return this.db
      .prepare(source)
      .all(...bind(params))
      .map((row) => ({ ...row }) as T);
  }

  withTransactionSync(task: () => void): void {
    try {
      this.execSync('BEGIN');
      task();
      this.execSync('COMMIT');
    } catch (e) {
      this.execSync('ROLLBACK');
      throw e;
    }
  }

  async execAsync(source: string): Promise<void> {
    await tick();
    this.execSync(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    await tick();
    return this.runSync(source, ...params);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    await tick();
    return this.getFirstSync<T>(source, ...params);
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    await tick();
    return this.getAllSync<T>(source, ...params);
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    try {
      await this.execAsync('BEGIN');
      await task();
      await this.execAsync('COMMIT');
    } catch (e) {
      await this.execAsync('ROLLBACK');
      throw e;
    }
  }

  closeSync(): void {
    this.db.close();
  }
}

/** An expo-sqlite module whose databases are files in a directory. */
export function forDirectory(dir: () => string) {
  return {
    openDatabaseSync: (name: string) => new ShimDatabase(join(dir(), name)),
  };
}
