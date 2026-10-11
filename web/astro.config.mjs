import { defineConfig } from 'astro/config';

import { isPlaceholder, site } from './src/site.ts';

// Remind whoever builds the site about details still to fill in (src/site.ts).
const missing = Object.entries(site).filter(([, v]) => typeof v === 'string' && isPlaceholder(v));
if (missing.length) {
  console.warn(`\n⚠ Fill in before publishing (web/src/site.ts): ${missing.map(([k]) => k).join(', ')}\n`);
}

export default defineConfig({
  // Pages are served as folders (/privacy/), which Amplify Hosting serves directly.
  trailingSlash: 'always',
  build: { format: 'directory' },
});
