/** The regions list and the map's progress card, with regions found on an earlier day. */
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { t } from '../src/i18n';
import { store } from '../src/state/store';
import { moveTo, renderApp, seedRegions, squareRegion, watchAlerts } from './helpers';

const HOME = { latitude: 40.0, longitude: -105.0 };
const AWAY = { latitude: 41.0, longitude: -104.0 };

beforeAll(async () => {
  await seedRegions(
    squareRegion('R1', 'Testville', 'city', HOME),
    squareRegion('R2', 'Test County', 'county', HOME, 0.02),
    squareRegion('R3', 'Elsewhere', 'city', AWAY),
  );
});

describe('regions', () => {
  it('lists regions by level, marks where you are, and counts unlocked cells', async () => {
    await renderApp('/regions');
    moveTo(HOME.latitude, HOME.longitude);
    expect(screen.getByText(t('levels.city'))).toBeTruthy();
    expect(screen.getByText(t('levels.county'))).toBeTruthy();
    expect(screen.getByText('Testville')).toBeTruthy();
    expect(screen.getByText('Test County')).toBeTruthy();
    expect(screen.getByText('Elsewhere')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(t('regions.youAreHere'))).toHaveLength(2));
    await waitFor(() => expect(store.unlocked.size).toBeGreaterThan(0));
    const count = store.unlocked.size.toLocaleString();
    expect(await screen.findByText(t('regions.cellsUnlocked', { count }))).toBeTruthy();
  });

  it('shows the picked region on the map, with its progress', async () => {
    const app = await renderApp('/regions');
    fireEvent.press(screen.getByText('Elsewhere'));
    await waitFor(() => expect(app.pathname()).toBe('/'));
    expect(await screen.findByText('Elsewhere')).toBeTruthy();
    expect(screen.getByText(t('level.city').toUpperCase())).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
  });

  it('shows progress in the region you are in and opens its share card', async () => {
    const app = await renderApp('/regions');
    fireEvent.press(screen.getByText('Testville'));
    await waitFor(() => expect(app.pathname()).toBe('/'));
    await waitFor(() => expect(screen.queryByText('0%')).toBeNull());
    fireEvent.press(screen.getByLabelText(t('share.a11y.open')));
    expect(await screen.findByText(t('share.privacy'))).toBeTruthy();
    expect(app.pathname()).toBe('/share');
    expect(app.params()).toEqual({ id: 'R1' });
  });

  it('removes a region after asking, keeping the explored cells', async () => {
    const alerts = watchAlerts();
    await renderApp('/regions');
    const cells = store.unlocked.size;
    fireEvent(screen.getByText('Elsewhere'), 'longPress');
    alerts.press('Elsewhere', t('regions.action.remove'));
    alerts.press(t('regions.remove.title', { name: 'Elsewhere' }), t('action.remove'));
    await waitFor(() => expect(screen.queryByText('Elsewhere')).toBeNull());
    expect(store.unlocked.size).toBe(cells);
  });

  it('offers to save a region for offline use', async () => {
    const alerts = watchAlerts();
    const app = await renderApp('/regions');
    fireEvent(screen.getByText('Testville'), 'longPress');
    alerts.press('Testville', t('regions.action.saveOffline'));
    alerts.press(t('regions.save.title', { name: 'Testville' }), t('action.save'));
    await waitFor(() => expect(app.pathname()).toBe('/offline'));
    expect(within(screen.getByText('Testville').parent!.parent!).getByText('Testville')).toBeTruthy();
  });

  it('opens settings', async () => {
    const app = await renderApp('/regions');
    fireEvent.press(screen.getByLabelText(t('settings.a11y.open')));
    await waitFor(() => expect(app.pathname()).toBe('/settings'));
    expect(await screen.findByText(t('settings.units'))).toBeTruthy();
  });
});
