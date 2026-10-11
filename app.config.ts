import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json with secrets read from the environment.
 *
 * Android uses Google Maps, which needs an API key in real builds (Expo Go
 * has its own). Set GOOGLE_MAPS_ANDROID_API_KEY before building. iOS uses
 * Apple Maps and needs no key.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY }],
  ],
});
