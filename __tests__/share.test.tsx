/** The share card: outline and percentage only, shared as an image. */
import * as Sharing from 'expo-sharing';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { captureRef } from 'react-native-view-shot';

import { t } from '../src/i18n';
import { openOnTopOfMap, seedRegions, squareRegion, watchAlerts } from './helpers';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

beforeAll(async () => {
  await seedRegions(squareRegion('R1', 'Testville', 'park', { latitude: 40, longitude: -105 }));
});

describe('share screen', () => {
  it('previews the card for a region', async () => {
    await openOnTopOfMap('/share?id=R1');
    expect(await screen.findByText('Testville')).toBeTruthy();
    expect(screen.getByText(t('level.park').toUpperCase())).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText(t('share.unlocked'))).toBeTruthy();
    expect(screen.getByText(t('share.privacy'))).toBeTruthy();
  });

  it('shares the card as a PNG image, then closes', async () => {
    const app = await openOnTopOfMap('/share?id=R1');
    fireEvent.press(await screen.findByText(t('share.button')));
    await waitFor(() => expect(app.pathname()).toBe('/'));
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(captureRef).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ format: 'png' }));
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///card.png',
      expect.objectContaining({ mimeType: 'image/png', dialogTitle: t('share.dialogTitle', { name: 'Testville' }) }),
    );
  });

  it('says so when the phone cannot share', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    const alerts = watchAlerts();
    await openOnTopOfMap('/share?id=R1');
    fireEvent.press(await screen.findByText(t('share.button')));
    await waitFor(() => expect(alerts.titles()).toContain(t('share.failed')));
  });

  it('shows nothing for a region that no longer exists', async () => {
    await openOnTopOfMap('/share?id=gone');
    expect(screen.queryByText(t('share.button'))).toBeNull();
  });
});
