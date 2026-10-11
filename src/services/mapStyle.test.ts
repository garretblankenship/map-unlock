import { describe, expect, it } from 'vitest';

import dark from '../../assets/map/style-dark.json';
import light from '../../assets/map/style.json';

type Style = {
  sources: Record<string, { tiles?: string[]; url?: string }>;
  sprite?: string;
  glyphs?: string;
  layers: { layout?: Record<string, unknown> }[];
};

const fonts = (s: Style) =>
  new Set(
    s.layers.flatMap((l) => {
      const f = l.layout?.['text-font'];
      return Array.isArray(f) && f.every((x) => typeof x === 'string') ? [f.join(',')] : [];
    }),
  );

describe('map styles', () => {
  it('use only version-less tile URLs (no TileJSON), so offline areas survive data updates', () => {
    for (const s of [light, dark] as Style[]) {
      for (const src of Object.values(s.sources)) {
        expect(src.url).toBeUndefined();
        for (const tile of src.tiles ?? []) expect(tile).not.toMatch(/planet\/\d{8}_/);
      }
    }
  });

  it('dark mode needs nothing an offline download of the light style lacks', () => {
    const l = light as Style;
    const d = dark as Style;
    const lightTiles = new Set(Object.values(l.sources).flatMap((s) => s.tiles ?? []));
    for (const s of Object.values(d.sources)) for (const tile of s.tiles ?? []) expect(lightTiles).toContain(tile);
    expect(d.sprite).toBe(l.sprite);
    expect(d.glyphs).toBe(l.glyphs);
    const lightFonts = fonts(l);
    for (const f of fonts(d)) expect(lightFonts).toContain(f);
  });
});
