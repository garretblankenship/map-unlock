import { describe, expect, it } from 'vitest';

import { type Shape, shapeContains, shapeContainsExact, shapeFromGeoJson } from './geometry';

/** Deterministic pseudo-random numbers so failures reproduce. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const ring = (pts: [number, number][]) => [...pts, pts[0]];

function star(cx: number, cy: number, spikes: number, r1: number, r2: number): [number, number][] {
  return Array.from({ length: spikes * 2 }, (_, i) => {
    const a = (i / (spikes * 2)) * 2 * Math.PI;
    const r = i % 2 ? r1 : r2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a) * 0.7];
  });
}

const shapes: Record<string, Shape> = {
  star: shapeFromGeoJson({ type: 'Polygon', coordinates: [ring(star(-100, 40, 200, 0.5, 2))] }),
  holes: shapeFromGeoJson({
    type: 'Polygon',
    coordinates: [ring(star(10, 50, 50, 1.5, 2)), ring(star(10, 50, 40, 0.3, 0.6)).reverse(), ring(star(10.9, 50.2, 30, 0.1, 0.2))],
  }),
  comb: shapeFromGeoJson({
    type: 'Polygon',
    coordinates: [
      ring([
        [0, 0],
        ...Array.from({ length: 60 }, (_, i): [number, number][] => [
          [i * 0.05, 1],
          [i * 0.05 + 0.02, 1],
          [i * 0.05 + 0.02, 0.1],
          [i * 0.05 + 0.05, 0.1],
        ]).flat(),
        [3, 0],
      ]),
    ],
  }),
  sliver: shapeFromGeoJson({
    type: 'Polygon',
    coordinates: [ring([[0, 0], [3, 2], [3.0001, 2.00005], ...star(1.5, 1, 40, 0.01, 0.02).slice(0, 30), [0.00005, 0.0002]])],
  }),
  islands: shapeFromGeoJson({
    type: 'MultiPolygon',
    coordinates: Array.from({ length: 30 }, (_, i) => [ring(star(150 + (i % 6) * 0.3, -30 + Math.floor(i / 6) * 0.3, 8, 0.05, 0.12))]),
  }),
};

describe('shape index', () => {
  for (const [name, shape] of Object.entries(shapes)) {
    it(`agrees with the exact test everywhere: ${name}`, () => {
      const r = rng(name.length * 7919);
      const { minX, minY, maxX, maxY } = shape.bbox;
      const padX = (maxX - minX) * 0.05;
      const padY = (maxY - minY) * 0.05;
      let inside = 0;
      for (let i = 0; i < 50_000; i++) {
        const x = minX - padX + r() * (maxX - minX + 2 * padX);
        const y = minY - padY + r() * (maxY - minY + 2 * padY);
        const exact = shapeContainsExact(shape, x, y);
        if (shapeContains(shape, x, y) !== exact) throw new Error(`${name}: disagree at ${x}, ${y} (exact ${exact})`);
        if (exact) inside++;
      }
      expect(inside).toBeGreaterThan(100);
    });
  }

  it('is much faster on a realistic region', () => {
    // A big region with a long, wiggly coastline (3,000 vertices), like a state or country.
    const r0 = rng(42);
    const coast: [number, number][] = Array.from({ length: 3000 }, (_, i) => {
      const a = (i / 3000) * 2 * Math.PI;
      const rad = 5 + 0.6 * Math.sin(a * 7) + 0.25 * Math.sin(a * 53) + 0.05 * r0();
      return [-100 + rad * Math.cos(a), 40 + rad * Math.sin(a) * 0.6];
    });
    const shape = shapeFromGeoJson({ type: 'Polygon', coordinates: [ring(coast)] });
    const { minX, minY, maxX, maxY } = shape.bbox;
    const r = rng(1);
    const pts = Array.from({ length: 200_000 }, () => [minX + r() * (maxX - minX), minY + r() * (maxY - minY)]);
    let t = performance.now();
    for (const [x, y] of pts) shapeContainsExact(shape, x, y);
    const exactMs = performance.now() - t;
    shapeContains(shape, minX, minY); // build the index
    t = performance.now();
    for (const [x, y] of pts) shapeContains(shape, x, y);
    const indexedMs = performance.now() - t;
    expect(indexedMs).toBeLessThan(exactMs / 5);
  });
});
