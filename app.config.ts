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
 *
 * WEBSITE_URL: the website in web/ (Amplify Hosting), for the privacy
 * policy, terms and support links in Settings.
 *
 * All three are published by web/ (see web/README.md); store builds need them.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  // Store builds must use our own hosting: the fallback lookup service
  // doesn't allow app traffic, and the stores require a privacy policy link.
  // EAS sets EAS_BUILD_PROFILE when building.
  if (process.env.EAS_BUILD_PROFILE === 'production') {
    const missing = ['BOUNDARIES_URL', 'MAP_STYLE_URL', 'WEBSITE_URL'].filter((k) => !process.env[k]);
    if (missing.length) throw new Error(`Set ${missing.join(', ')} for production builds (see web/README.md).`);
  }
  return withExtras(config);
};

const withExtras = (config: ConfigContext['config']): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    mapStyleUrl: process.env.MAP_STYLE_URL,
    boundariesUrl: process.env.BOUNDARIES_URL,
    websiteUrl: process.env.WEBSITE_URL,
  },
});
