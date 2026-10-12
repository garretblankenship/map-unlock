import { type Shape, drawingFrame } from './geometry';

/**
 * A region's outline as an SVG path that fits a box, for share cards. Only
 * the boundary is drawn, never the explored streets, so a shared card
 * doesn't reveal where someone lives or goes.
 *
 * Rings are already Web Mercator grid coordinates with y pointing down, the
 * same way SVG draws. Points closer than `minStep` pixels are skipped, which
 * keeps a country's coastline to a manageable path.
 */
export function outlinePath(shape: Shape, width: number, height: number, padding = 0, minStep = 0.5): string {
  const frame = drawingFrame(shape);
  const { minX, minY, maxX, maxY } = frame.bbox;
  const bw = Math.max(maxX - minX, 1e-9);
  const bh = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((width - 2 * padding) / bw, (height - 2 * padding) / bh);
  const ox = (width - bw * scale) / 2;
  const oy = (height - bh * scale) / 2;
  const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

  const parts: string[] = [];
  for (const polygon of shape.polygons) {
    for (const ring of polygon) {
      let lastX = NaN;
      let lastY = NaN;
      let n = 0;
      let d = '';
      for (let i = 0; i < ring.length; i += 2) {
        const x = ox + (frame.x(ring[i]) - minX) * scale;
        const y = oy + (ring[i + 1] - minY) * scale;
        const last = i + 2 >= ring.length;
        if (n > 0 && !last && Math.abs(x - lastX) < minStep && Math.abs(y - lastY) < minStep) continue;
        d += `${n === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`;
        lastX = x;
        lastY = y;
        n++;
      }
      if (n >= 3) parts.push(d + 'Z');
    }
  }
  return parts.join('');
}
