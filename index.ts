// The app's entry point. The background location task must be defined when
// the JS bundle loads: when the OS starts the app in the background to
// deliver locations (e.g. after Android killed it mid-walk), no screens are
// rendered, so route files like app/_layout.tsx are never loaded.
import './src/services/tracking';

// Register the app through Expo Router; keep this last.
import 'expo-router/entry';
