import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with settings read from the environment.
 *
 * MAP_STYLE_URL: where offline map downloads fetch the map style from. It
 * must serve assets/map/style.json unchanged (see src/services/mapStyle.ts).
 * Defaults to this repository's copy on the jsDelivr CDN.
 *
 * BOUNDARIES_URL: where the region boundary files built by pipeline/ are
 * hosted (the folder holding meta.json). Required before launch; until it's
 * set, the app falls back to the public OpenStreetMap lookup service, which
 * is only acceptable for development.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    mapStyleUrl: process.env.MAP_STYLE_URL,
    boundariesUrl: process.env.BOUNDARIES_URL,
  },
});
