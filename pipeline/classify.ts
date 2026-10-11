/**
 * Which OpenStreetMap areas become regions, and of what kind.
 *
 * Administrative boundaries carry an admin_level (2–11) whose meaning
 * differs by country (see wiki.openstreetmap.org/wiki/Tag:boundary=administrative).
 * DEFAULT_LEVELS fits most countries; COUNTRY_LEVELS overrides the ones
 * that differ. When adding a country, check its row in that wiki table and
 * the per-country counts the build prints.
 */
export type Level = 'neighbourhood' | 'city' | 'county' | 'park' | 'state' | 'country';
type LevelMap = Partial<Record<number, Level>>;

export const DEFAULT_LEVELS: LevelMap = {
  2: 'country',
  4: 'state',
  6: 'county',
  8: 'city',
  9: 'neighbourhood',
  10: 'neighbourhood',
};

export const COUNTRY_LEVELS: Record<string, LevelMap> = {
  // Local government areas (e.g. "City of Sydney") are level 6; suburbs 9–10.
  AU: { 2: 'country', 4: 'state', 6: 'city', 9: 'neighbourhood', 10: 'neighbourhood' },
  // Prefecture-level cities are 5, counties and city districts 6.
  CN: { 2: 'country', 4: 'state', 5: 'city', 6: 'county', 8: 'neighbourhood' },
  // Prefectures 4; cities, towns and villages (incl. Tokyo's special wards) 7; city wards 8;
  // machi 9. Level 10 (chōme) are single blocks, too small to be goals.
  JP: { 2: 'country', 4: 'state', 7: 'city', 8: 'neighbourhood', 9: 'neighbourhood' },
  // Provinces and metropolitan cities 4; si/gun/gu 6; dong 8.
  KR: { 2: 'country', 4: 'state', 6: 'city', 8: 'neighbourhood' },
  // Regions 4; territorial authorities (cities and districts) 6; suburbs 9–10.
  NZ: { 2: 'country', 4: 'state', 6: 'city', 9: 'neighbourhood', 10: 'neighbourhood' },
};

/** IUCN-style protection classes kept as parks: wilderness, national parks, monuments, habitats, landscapes, managed resources. */
const PARK_CLASSES = new Set(['1', '1a', '1b', '2', '3', '4', '5', '6']);
/** Smaller reserves are left out so towns aren't littered with pocket-sized "parks". */
export const MIN_PARK_KM2 = 1;
/**
 * Neighbourhoods mapped as place polygons (not administrative) include
 * single housing developments; below this size they're left out.
 */
export const MIN_PLACE_NEIGHBOURHOOD_KM2 = 0.2;

export type Tags = Record<string, string | undefined>;

/** Whether this area could be a park (before checking its size). */
export function isPark(tags: Tags): boolean {
  if (tags.boundary === 'national_park') return true;
  if (tags.boundary === 'protected_area') return PARK_CLASSES.has((tags.protect_class ?? '').toLowerCase());
  return tags.leisure === 'nature_reserve';
}

/**
 * The region level for an area, or null to skip it. `country` is the ISO
 * code of the country the area lies in, when known.
 */
export function classify(tags: Tags, country: string | null): Level | null {
  if (!tags.name) return null;
  if (tags.boundary === 'administrative') {
    const level = Number(tags.admin_level);
    if (!Number.isInteger(level)) return null;
    if (level === 2) return 'country';
    return ((country && COUNTRY_LEVELS[country]) || DEFAULT_LEVELS)[level] ?? null;
  }
  if (isPark(tags)) return 'park';
  if (tags.place === 'suburb' || tags.place === 'quarter' || tags.place === 'neighbourhood') return 'neighbourhood';
  return null;
}

/** A country's ISO 3166-1 alpha-2 code from its tags. */
export function countryCode(tags: Tags): string | null {
  const code = tags['ISO3166-1:alpha2'] ?? tags['ISO3166-1'];
  return code && /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Simplification per level, in meters: tighter than a map cell (~30 m) for small regions. */
export const TOLERANCE_METERS: Record<Level, number> = {
  neighbourhood: 5,
  city: 10,
  county: 30,
  park: 15,
  state: 150,
  country: 500,
};

/**
 * Levels are grouped into tile sets at different zooms: small, dense
 * regions in small tiles, big ones in big tiles. The app fetches one tile
 * per group for a location.
 */
export const TILE_GROUPS = {
  local: { zoom: 11, levels: ['neighbourhood', 'city'] as Level[] },
  mid: { zoom: 8, levels: ['county', 'park'] as Level[] },
  wide: { zoom: 5, levels: ['state', 'country'] as Level[] },
};
export type TileGroup = keyof typeof TILE_GROUPS;

export function groupFor(level: Level): TileGroup {
  for (const [g, { levels }] of Object.entries(TILE_GROUPS)) if (levels.includes(level)) return g as TileGroup;
  throw new Error(`No tile group for ${level}`);
}
