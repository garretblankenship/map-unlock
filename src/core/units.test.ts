import { describe, expect, it } from 'vitest';

import { formatArea, formatDistance, resolveUnits, unitsForPhone } from './units';

describe('units', () => {
  it('follows the phone unless overridden', () => {
    expect(unitsForPhone('us')).toBe('imperial');
    expect(unitsForPhone('uk')).toBe('imperial');
    expect(unitsForPhone('metric')).toBe('metric');
    expect(unitsForPhone(null)).toBe('metric');
    expect(resolveUnits('auto', 'us')).toBe('imperial');
    expect(resolveUnits('metric', 'us')).toBe('metric');
    expect(resolveUnits('imperial', 'metric')).toBe('imperial');
  });

  it('formats metric areas', () => {
    expect(formatArea(950, 'metric')).toBe('950 m²');
    expect(formatArea(2_345_000, 'metric')).toBe('2.35 km²');
    expect(formatArea(1_234_000_000, 'metric')).toBe('1,234 km²');
  });

  it('formats imperial areas in acres, then square miles', () => {
    expect(formatArea(40_469, 'imperial')).toBe('10 acres');
    expect(formatArea(2_589_988, 'imperial')).toBe('1.00 mi²');
    expect(formatArea(2_589_988_110, 'imperial')).toBe('1,000 mi²');
  });

  it('formats distances', () => {
    expect(formatDistance(420, 'metric')).toBe('420 m');
    expect(formatDistance(12_340, 'metric')).toBe('12.3 km');
    expect(formatDistance(100, 'imperial')).toBe('328 ft');
    expect(formatDistance(16_093, 'imperial')).toBe('10.0 mi');
  });
});
