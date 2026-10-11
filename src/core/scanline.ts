/**
 * Even-odd scanline fill sampled at cell centers. `rings` are flat
 * [x0, y0, x1, y1, ...] arrays; multiplying by `scale` converts them to cell
 * units. For every run of cells whose centers lie inside, calls
 * onSpan(row, xStart, xEndExclusive). Cost scales with the boundary length
 * and number of rows, not the area.
 */
export function scanRings(
  rings: ArrayLike<number>[],
  onSpan: (row: number, xStart: number, xEnd: number) => void,
  scale = 1,
  rowRange: [number, number] = [-Infinity, Infinity],
): void {
  const crossings = new Map<number, number[]>();
  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i * 2] * scale;
      const yi = ring[i * 2 + 1] * scale;
      const xj = ring[j * 2] * scale;
      const yj = ring[j * 2 + 1] * scale;
      if (yi === yj) continue;
      const lo = Math.max(Math.ceil(Math.min(yi, yj) - 0.5), rowRange[0]);
      const hi = Math.min(Math.ceil(Math.max(yi, yj) - 0.5), rowRange[1]);
      for (let r = lo; r < hi; r++) {
        const py = r + 0.5;
        let row = crossings.get(r);
        if (!row) crossings.set(r, (row = []));
        row.push(xi + ((py - yi) * (xj - xi)) / (yj - yi));
      }
    }
  }
  for (const [r, row] of crossings) {
    row.sort((a, b) => a - b);
    for (let k = 0; k + 1 < row.length; k += 2) {
      const start = Math.ceil(row[k] - 0.5);
      const end = Math.ceil(row[k + 1] - 0.5);
      if (end > start) onSpan(r, start, end);
    }
  }
}
