/**
 * Everything on the site that you'll want to change in one place. Values in
 * [brackets] are placeholders; the build lists any that are left before you
 * publish (see astro.config.mjs).
 */
export const site = {
  name: 'Open World Life',
  tagline: 'Unlock the real world.',
  description:
    'A fog-of-war map for real life. Walk, hike, cycle and drive to clear the fog and complete every neighbourhood, city, park and country.',
  /** Who publishes the app, as it should appear in the policies. */
  publisher: '[Your name or company]',
  supportEmail: '[support email]',
  /** Jurisdiction whose laws govern the terms, e.g. "the State of Ohio, USA". */
  governingLaw: '[governing law]',
  /** Date the policies were last changed. */
  policiesUpdated: '[date of publication]',
  /** Store links, once the app is live. */
  appStoreUrl: null as string | null,
  playStoreUrl: null as string | null,
};

export const isPlaceholder = (value: string) => value.startsWith('[');
