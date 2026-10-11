import { describe, expect, it, vi } from 'vitest';

import { levelForRank } from './boundaries';

vi.mock('expo-localization', () => ({ getLocales: () => [] }));
vi.mock('expo-network', () => ({}));

describe('levelForRank', () => {
  it('maps OpenStreetMap place ranks to region levels', () => {
    expect(levelForRank(4)).toBe('country');
    expect(levelForRank(8)).toBe('state');
    expect(levelForRank(12)).toBe('county');
    expect(levelForRank(16)).toBe('city');
    expect(levelForRank(20)).toBe('neighbourhood');
  });
});
