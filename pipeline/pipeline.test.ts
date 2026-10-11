import { describe, expect, it } from 'vitest';

import { decodeRing, encodeRing } from '../shared/boundaryCodec.ts';
import { classify, countryCode, groupFor, isPark } from './classify.ts';
import {
  type Polygon,
  type Ring,
  areaKm2,
  clipRing,
  interiorPoint,
  pointInRings,
  ringAreaKm2,
  simplifyPolygons,
  simplifyRing,
} from './geo.ts';
import { tileBBox, tileX, tileY, tilesFor } from './tiles.ts';

const square = (x0: number, y0: number, size: number): Ring => [
  [x0, y0],
  [x0 + size, y0],
  [x0 + size, y0 + size],
  [x0, y0 + size],
  [x0, y0],
];

describe('classify', () => {
  it('uses default admin levels', () => {
    expect(classify({ boundary: 'administrative', admin_level: '2', name: 'X' }, null)).toBe('country');
    expect(classify({ boundary: 'administrative', admin_level: '4', name: 'Ohio' }, 'US')).toBe('state');
    expect(classify({ boundary: 'administrative', admin_level: '6', name: 'King County' }, 'US')).toBe('county');
    expect(classify({ boundary: 'administrative', admin_level: '8', name: 'Seattle' }, 'US')).toBe('city');
    expect(classify({ boundary: 'administrative', admin_level: '10', name: 'Ballard' }, 'US')).toBe('neighbourhood');
    expect(classify({ boundary: 'administrative', admin_level: '5', name: 'X' }, 'DE')).toBeNull();
  });

  it('applies country overrides', () => {
    expect(classify({ boundary: 'administrative', admin_level: '7', name: '新宿区' }, 'JP')).toBe('city');
    expect(classify({ boundary: 'administrative', admin_level: '7', name: 'X' }, 'FR')).toBeNull();
    expect(classify({ boundary: 'administrative', admin_level: '10', name: '二子一丁目' }, 'JP')).toBeNull();
    expect(classify({ boundary: 'administrative', admin_level: '6', name: 'City of Sydney' }, 'AU')).toBe('city');
  });

  it('keeps named parks of protected classes only', () => {
    expect(classify({ boundary: 'national_park', name: 'Crater Lake National Park' }, 'US')).toBe('park');
    expect(classify({ boundary: 'protected_area', protect_class: '6', name: 'Mt. Hood National Forest' }, 'US')).toBe('park');
    expect(isPark({ boundary: 'protected_area', protect_class: '21' })).toBe(false);
    expect(classify({ leisure: 'nature_reserve', name: 'Marsh' }, 'US')).toBe('park');
    expect(classify({ boundary: 'national_park' }, 'US')).toBeNull(); // unnamed
  });

  it('reads neighbourhood polygons and country codes', () => {
    expect(classify({ place: 'suburb', name: 'Fremont' }, 'US')).toBe('neighbourhood');
    expect(countryCode({ 'ISO3166-1:alpha2': 'US' })).toBe('US');
    expect(countryCode({ 'ISO3166-1': 'lu' })).toBeNull();
    expect(groupFor('park')).toBe('mid');
  });
});

describe('geometry', () => {
  it('measures area', () => {
    // A 0.01° square near the equator is about 1.11 km on a side.
    expect(ringAreaKm2(square(0, 0, 0.01))).toBeCloseTo(1.236, 2);
    const withHole: Polygon = [square(0, 0, 0.02), square(0.005, 0.005, 0.01)];
    expect(areaKm2([withHole])).toBeCloseTo(ringAreaKm2(square(0, 0, 0.02)) - ringAreaKm2(square(0, 0, 0.01)), 3);
  });

  it('finds a point inside awkward shapes', () => {
    // A U shape whose bounding-box center is outside it.
    const u: Ring = [[0, 0], [3, 0], [3, 3], [2, 3], [2, 1], [1, 1], [1, 3], [0, 3], [0, 0]];
    const p = interiorPoint([[u]])!;
    expect(pointInRings([u], p[0], p[1])).toBe(true);
    // A square with a hole in the middle.
    const donut: Polygon = [square(0, 0, 3), square(1, 1, 1)];
    const q = interiorPoint([donut])!;
    expect(pointInRings(donut, q[0], q[1])).toBe(true);
  });

  it('simplifies within tolerance and keeps rings closed', () => {
    const ring: Ring = [];
    for (let i = 0; i <= 1000; i++) {
      const a = (i / 1000) * 2 * Math.PI;
      ring.push([0.01 * Math.cos(a), 0.01 * Math.sin(a)]);
    }
    ring[ring.length - 1] = ring[0];
    const s = simplifyRing(ring, 10);
    expect(s.length).toBeLessThan(ring.length / 5);
    expect(s[0]).toEqual(s[s.length - 1]);
    expect(ringAreaKm2(s)).toBeCloseTo(ringAreaKm2(ring), 1);
  });

  it('drops specks but never everything', () => {
    const big: Polygon = [square(0, 0, 0.1)];
    const speck: Polygon = [square(1, 1, 0.00001)];
    expect(simplifyPolygons([big, speck], 50)).toHaveLength(1);
    expect(simplifyPolygons([speck], 50)).toHaveLength(1);
  });

  it('clips rings to a box', () => {
    const clipped = clipRing(square(0, 0, 4), [1, 1, 2, 2]);
    expect(clipped[0]).toEqual(clipped[clipped.length - 1]);
    expect(ringAreaKm2(clipped)).toBeCloseTo(ringAreaKm2(square(1, 1, 1)), 3);
    expect(clipRing(square(10, 10, 1), [0, 0, 1, 1])).toEqual([]);
    // Points inside the clipped piece are still inside.
    expect(pointInRings([clipped], 1.5, 1.5)).toBe(true);
  });
});

describe('ring encoding', () => {
  it('round-trips to about a metre', () => {
    const ring: [number, number][] = [
      [-122.33521, 47.60621],
      [-122.33102, 47.60999],
      [-122.32987, 47.60412],
      [-122.33521, 47.60621],
    ];
    const encoded = encodeRing(ring);
    expect(encoded.slice(2).every((n) => Math.abs(n) < 1000)).toBe(true);
    decodeRing(encoded).forEach(([x, y], i) => {
      expect(x).toBeCloseTo(ring[i][0], 5);
      expect(y).toBeCloseTo(ring[i][1], 5);
    });
  });
});

describe('tiles', () => {
  it('matches standard Web Mercator tiles', () => {
    expect([tileX(-122.33, 10), tileY(47.61, 10)]).toEqual([164, 357]);
    const [w, s, e, n] = tileBBox(10, 164, 357);
    expect(w).toBeLessThan(-122.33);
    expect(e).toBeGreaterThan(-122.33);
    expect(s).toBeLessThan(47.61);
    expect(n).toBeGreaterThan(47.61);
    expect([...tilesFor([w + 0.01, s + 0.01, e - 0.01, n - 0.01], 10)]).toEqual([[164, 357]]);
  });
});
