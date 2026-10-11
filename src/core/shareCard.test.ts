import { describe, expect, it } from 'vitest';

import { shapeFromGeoJson } from './geometry';
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
});
