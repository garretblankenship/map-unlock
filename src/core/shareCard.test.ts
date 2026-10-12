import { describe, expect, it } from 'vitest';

import { shapeBoundsLatLng, shapeFromGeoJson } from './geometry';
import { outlinePath } from './shareCard';

const square = shapeFromGeoJson({
  type: 'Polygon',
  coordinates: [
    [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ],
  ],
});

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('outlinePath', () => {
  it('fits the outline inside the box with padding', () => {
    const d = outlinePath(square, 300, 200, 20);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const ns = numbers(d);
    const xs = ns.filter((_, i) => i % 2 === 0);
    const ys = ns.filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeCloseTo(20, 0);
    expect(Math.max(...ys)).toBeCloseTo(180, 0);
    // Centered horizontally: equal margins.
    expect(Math.min(...xs)).toBeCloseTo(300 - Math.max(...xs), 0);
  });

  it('puts north at the top', () => {
    const d = outlinePath(square, 100, 100);
    // The first point is the south-west corner, so it's at the bottom.
    expect(numbers(d)[1]).toBeCloseTo(100, 0);
  });

  it('drops points too close together to see', () => {
    const ring: number[][] = [];
    for (let i = 0; i <= 2000; i++) {
      const a = (i / 2000) * 2 * Math.PI;
      ring.push([Math.cos(a), Math.sin(a)]);
    }
    const circle = shapeFromGeoJson({ type: 'Polygon', coordinates: [ring] });
    const points = outlinePath(circle, 100, 100).split(/[ML]/).length - 1;
    expect(points).toBeLessThan(700);
    expect(points).toBeGreaterThan(50);
  });

  it('draws a region across the 180° meridian in one piece', () => {
    // Two islands either side of the line, 2° apart: not 358° apart.
    const fiji = shapeFromGeoJson({
      type: 'MultiPolygon',
      coordinates: [
        [[[178, -17], [179.5, -17], [179.5, -16], [178, -16], [178, -17]]],
        [[[-180, -17], [-179.5, -17], [-179.5, -16], [-180, -16], [-180, -17]]],
      ],
    });
    const xs = numbers(outlinePath(fiji, 300, 200, 0)).filter((_, i) => i % 2 === 0);
    // The western island sits just right of the eastern one, filling the width.
    expect(Math.min(...xs)).toBeCloseTo(0, 0);
    expect(Math.max(...xs)).toBeCloseTo(300, 0);
    const gap = [...new Set(xs)].sort((a, b) => a - b);
    expect(gap).toHaveLength(4); // 178, 179.5 | 180, 180.5: one small gap, not a world apart
    expect(gap[2] - gap[1]).toBeLessThan(gap[1] - gap[0]);
  });
});

describe('shapeBoundsLatLng', () => {
  it('frames the largest part of a region across the 180° meridian, not the world', () => {
    const shape = shapeFromGeoJson({
      type: 'MultiPolygon',
      coordinates: [
        [[[-125, 30], [-70, 30], [-70, 48], [-125, 48], [-125, 30]]], // mainland
        [[[172, 52], [174, 52], [174, 53], [172, 53], [172, 52]]], // an island past the line
      ],
    });
    const { sw, ne } = shapeBoundsLatLng(shape);
    expect(sw.longitude).toBeCloseTo(-125, 5);
    expect(ne.longitude).toBeCloseTo(-70, 5);
    expect(sw.latitude).toBeCloseTo(30, 5);
    expect(ne.latitude).toBeCloseTo(48, 5);
  });
});
