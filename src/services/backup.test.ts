import { describe, expect, it, vi } from 'vitest';

import plugin from '../../plugins/with-backup-rules.js?raw';
import { CACHE_DB, PROGRESS_DB } from './db';

vi.mock('expo-sqlite', () => ({}));

describe('Android backup rules', () => {
  it('back up the progress database by its real file name', () => {
    expect(plugin).toContain(`'SQLite/${PROGRESS_DB}'`);
    expect(plugin).toContain(`'SQLite/${PROGRESS_DB}-wal'`);
  });

  it('leave the re-downloadable cache out', () => {
    expect(plugin).not.toContain(CACHE_DB);
  });
});
