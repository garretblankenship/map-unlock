/** Saved offline areas: listing, progress and deleting. */
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { formatBytes } from '../src/core/mapgeo';
import { t } from '../src/i18n';
import * as db from '../src/services/db';
import { fakeOfflineManager, renderApp, watchAlerts } from './helpers';

beforeAll(async () => {
  // Saved on an earlier day: one finished (map, water and boundaries), one interrupted.
  fakeOfflineManager.seed('p1', 'Mountain trip', [-105.1, 39.9, -105.0, 40.0], true);
  await db.setMeta('offlineWaterDone:p1', true);
  await db.setMeta('offlineBoundariesDone:p1', true);
  fakeOfflineManager.seed('p2', 'Coast walk', [-124.1, 44.0, -124.0, 44.1], false);
});

describe('offline screen', () => {
  it('lists saved areas with their state and size, and deletes one after asking', async () => {
    const alerts = watchAlerts();
    await renderApp('/offline');

    expect(await screen.findByText('Mountain trip')).toBeTruthy();
    expect(screen.getByText('Coast walk')).toBeTruthy();
    expect(await screen.findByText(new RegExp(t('offline.ready', { size: '' })))).toBeTruthy();
    // No signal: the unfinished one waits for it.
    expect(screen.getByText(/^Waiting for signal/)).toBeTruthy();
    expect(screen.getByText(t('offline.storage', { size: formatBytes(12_345_678 + 1_000_000) }))).toBeTruthy();

    fireEvent.press(screen.getByLabelText(t('offline.a11y.delete', { name: 'Coast walk' })));
    alerts.press(t('offline.delete.title', { name: 'Coast walk' }), t('action.delete'));
    await waitFor(() => expect(screen.queryByText('Coast walk')).toBeNull());
    expect(fakeOfflineManager.packs.has('p2')).toBe(false);
    expect(screen.getByText('Mountain trip')).toBeTruthy();
  });
});
