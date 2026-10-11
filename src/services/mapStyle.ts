import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import Constants from 'expo-constants';

import bundledStyle from '../../assets/map/style.json';

/**
 * The basemap: OpenFreeMap's Liberty style with version-less tile URLs
 * (see scripts/make-map-style.mjs for why).
 *
 * The map draws from the copy bundled in the app, so it loads even on a
 * first launch without signal. Offline downloads need the same style at a
 * web address, because MapLibre fetches it over the network. Both copies
 * must reference the same tile, font and sprite URLs, or downloaded areas
 * won't match what the map asks for.
 *
 * By default that address is this repository's copy via the jsDelivr CDN,
 * pinned to a commit so it can't change underneath existing downloads. For
 * production, host assets/map/style.json yourself and set MAP_STYLE_URL
 * when building (read in app.config.ts).
 */
export const MAP_STYLE = bundledStyle as unknown as StyleSpecification;

const DEFAULT_STYLE_URL =
  'https://cdn.jsdelivr.net/gh/garretblankenship/map-unlock@dccba60cf3d485feff1666ccdabc5cbc0220ebc3/assets/map/style.json';

export const MAP_STYLE_URL: string =
  (Constants.expoConfig?.extra?.mapStyleUrl as string | undefined) || DEFAULT_STYLE_URL;
