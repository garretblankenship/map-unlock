import { defineConfig } from 'astro/config';

import { isPlaceholder, site } from './src/site.ts';

// Details still to fill in (src/site.ts): a reminder for local and preview
// builds, but the live site (Amplify's main branch) refuses to build with
// placeholders in the privacy policy and terms the app stores link to.
const missing = Object.entries(site).filter(([, v]) => typeof v === 'string' && isPlaceholder(v));
if (missing.length) {
  const message = `Fill in before publishing (web/src/site.ts): ${missing.map(([k]) => k).join(', ')}`;
  if (process.env.AWS_BRANCH === 'main') throw new Error(message);
  console.warn(`\n⚠ ${message}\n`);
}

export default defineConfig({
  site: site.url,
  // Pages are served as folders (/privacy/), which Amplify Hosting serves directly.
  trailingSlash: 'always',
  build: { format: 'directory' },
});
