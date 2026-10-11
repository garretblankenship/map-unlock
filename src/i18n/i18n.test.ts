import { describe, expect, it, vi } from 'vitest';

import { pickLanguage, setLanguage, t } from './index';

// Hoisted above the imports by vitest.
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'fr' }, { languageCode: 'en' }] }));

describe('i18n', () => {
  it('falls back to English for unsupported languages', () => {
    expect(pickLanguage(['fr', null])).toBe('en');
    expect(pickLanguage(['en'])).toBe('en');
    setLanguage('de');
    expect(t('tab.map')).toBe('Map');
  });

  it('fills in values and plurals', () => {
    expect(t('offline.storage', { size: '4 MB' })).toBe('Using 4 MB of storage.');
    expect(t('map.placesToLookUp', { count: 1 })).toBe(' · 1 place to look up');
    expect(t('map.placesToLookUp', { count: 3 })).toBe(' · 3 places to look up');
  });
});
