/** The explainer shown before asking for "Always" location access. */
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import { t } from '../src/i18n';
import { store } from '../src/state/store';
import { renderApp, setLocationPermissions } from './helpers';

/** Taps the map's background-exploring switch, which opens the explainer when needed. */
async function openFromMap() {
  const app = await renderApp('/');
  fireEvent.press(screen.getByText(t('map.backgroundOff')));
  await waitFor(() => expect(app.pathname()).toBe('/background-permission'));
  return app;
}

describe('background permission screen', () => {
  it('explains why, then asks; turning down "Always" leaves it off', async () => {
    const app = await openFromMap();
    expect(app.params()).toEqual({ step: 'explain' });
    expect(screen.getByText(t('background.title'))).toBeTruthy();
    expect(screen.getByText(t('background.point.private'))).toBeTruthy();
    fireEvent.press(screen.getByText(t('background.continue')));
    await waitFor(() => expect(app.pathname()).toBe('/'));
    expect(store.backgroundTracking).toBe(false);
    expect(store.lastError).toBe(t('location.allowAlways'));
  });

  it('sends you to the phone settings when the system will not ask again', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    setLocationPermissions('granted', 'blocked');
    const app = await openFromMap();
    expect(app.params()).toEqual({ step: 'openSettings' });
    expect(screen.getByText(t('background.blocked'))).toBeTruthy();
    fireEvent.press(screen.getByText(t('background.openSettings')));
    await waitFor(() => expect(openSettings).toHaveBeenCalled());
  });

  it('can be dismissed', async () => {
    setLocationPermissions('granted', 'ask');
    const app = await openFromMap();
    fireEvent.press(screen.getByText(t('background.notNow')));
    await waitFor(() => expect(app.pathname()).toBe('/'));
  });

  // Last: background exploring stays on afterwards.
  it('starts background exploring when "Always" is allowed', async () => {
    const app = await openFromMap();
    setLocationPermissions('granted', 'granted'); // the person taps "Allow all the time"
    fireEvent.press(screen.getByText(t('background.continue')));
    await waitFor(() => expect(store.backgroundTracking).toBe(true));
    await waitFor(() => expect(app.pathname()).toBe('/'));
    expect(screen.getByText(t('map.backgroundOn'))).toBeTruthy();
  });
});
