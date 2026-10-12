/** A fresh install: nothing explored, no regions, no saved areas, no signal. */
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { t } from '../src/i18n';
import { store } from '../src/state/store';
import { moveTo, renderApp, setLocationPermissions, watchAlerts } from './helpers';

describe('map screen', () => {
  it('starts fogged, waiting for a location, with background exploring off', async () => {
    await renderApp('/');
    expect(screen.getByText(t('map.waitingForLocation'))).toBeTruthy();
    expect(screen.getByText(t('map.backgroundOff'))).toBeTruthy();
    expect(screen.getByTestId('source-fog')).toBeTruthy();
  });

  it('has no saved offline areas yet', async () => {
    await renderApp('/offline');
    expect(screen.getByText(t('offline.title'))).toBeTruthy();
    expect(screen.getByText(t('offline.empty'))).toBeTruthy();
  });

  it('refuses to save the whole world for offline use', async () => {
    const alerts = watchAlerts();
    await renderApp('/');
    fireEvent.press(screen.getByLabelText(t('map.a11y.saveArea')));
    expect(alerts.titles()).toEqual([t('map.areaTooBig.title')]);
  });

  it('explains background exploring before asking for "Always"', async () => {
    const app = await renderApp('/');
    fireEvent.press(screen.getByText(t('map.backgroundOff')));
    expect(await screen.findByText(t('background.title'))).toBeTruthy();
    expect(app.pathname()).toBe('/background-permission');
    expect(app.params()).toEqual({ step: 'explain' });
  });

  it('turns background exploring on and off straight away once "Always" is allowed', async () => {
    setLocationPermissions('granted', 'granted');
    await renderApp('/');
    fireEvent.press(screen.getByText(t('map.backgroundOff')));
    expect(await screen.findByText(t('map.backgroundOn'))).toBeTruthy();
    fireEvent.press(screen.getByText(t('map.backgroundOn')));
    expect(await screen.findByText(t('map.backgroundOff'))).toBeTruthy();
  });

  it('unlocks the area around the first fix and explains that areas wait for signal', async () => {
    await renderApp('/');
    expect(store.unlocked.size).toBe(0);
    moveTo(40.0, -105.0);
    await waitFor(() => expect(store.unlocked.size).toBeGreaterThan(0));
    expect(await screen.findByText(t('map.noSignal'))).toBeTruthy();
    expect(screen.getByText(new RegExp(t('map.offlineSaved')))).toBeTruthy();
  });
});
