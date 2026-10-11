import { getLocales } from 'expo-localization';

import { en } from './en';

/**
 * Translations. English is the only language for now; others are added by
 * giving them a catalog with the same keys and listing them here.
 */
export type Catalog = typeof en;
export type TextKey = keyof Catalog;

const catalogs: Record<string, Catalog> = { en };

/** The best supported language from the phone's preferences. */
export function pickLanguage(preferred: (string | null)[]): string {
  return preferred.find((code) => code != null && code in catalogs) ?? 'en';
}

function deviceLanguages(): (string | null)[] {
  try {
    return getLocales().map((l) => l.languageCode);
  } catch {
    return [];
  }
}

let catalog: Catalog = catalogs[pickLanguage(deviceLanguages())];

/** For tests, and for switching language at runtime later. */
export function setLanguage(code: string) {
  catalog = catalogs[pickLanguage([code])];
}

type Params<K extends TextKey> = Catalog[K] extends (p: infer P) => string ? [params: P] : [];

/** Text for a key, filling in any values it needs: t('offline.storage', { size: '4 MB' }). */
export function t<K extends TextKey>(key: K, ...params: Params<K>): string {
  const entry = catalog[key] as string | ((p: unknown) => string);
  return typeof entry === 'function' ? entry(params[0]) : entry;
}
