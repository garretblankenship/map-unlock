/** Settings: units, resetting progress, and links to the website. */
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { t } from '../src/i18n';
import * as db from '../src/services/db';
import { store } from '../src/state/store';
import { moveTo, renderApp, seedRegions, squareRegion, watchAlerts } from './helpers';

const selected = (label: string) =>
  screen.getByText(label).parent?.parent?.props.accessibilityState?.selected as boolean | undefined;

describe('settings screen', () => {
  it('follows the phone for units until one is picked, and remembers the choice', async () => {
    await renderApp('/settings');
    expect(selected(t('settings.units.auto'))).toBe(true);
    fireEvent.press(screen.getByText(t('settings.units.imperial')));
    await waitFor(() => expect(selected(t('settings.units.imperial'))).toBe(true));
    expect(selected(t('settings.units.auto'))).toBe(false);
    expect(await db.getMeta('settings')).toEqual({ units: 'imperial' });
  });

  it('resets progress after asking, keeping the settings', async () => {
    await seedRegions(squareRegion('R1', 'Testville', 'city', { latitude: 40, longitude: -105 }));
    const alerts = watchAlerts();
    await renderApp('/settings');
    moveTo(40, -105);
    await waitFor(() => expect(store.unlocked.size).toBeGreaterThan(0));
    expect(store.regions).toHaveLength(1);

    fireEvent.press(screen.getByText(t('regions.reset')));
    alerts.press(t('regions.reset.title'), t('action.reset'));
    await waitFor(() => expect(store.unlocked.size).toBe(0));
    expect(store.regions).toHaveLength(0);
    expect(await db.loadCells()).toEqual([]);
    expect(store.settings.units).toBe('imperial');
  });

  it('shows the map data credits', async () => {
    await renderApp('/settings');
    expect(screen.getByText(t('regions.attribution'))).toBeTruthy();
    // The website links only appear in builds that know the website's address.
    expect(screen.queryByText(t('settings.privacy'))).toBeNull();
  });
});
