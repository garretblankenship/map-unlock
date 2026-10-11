# Website and map-data CDN (AWS Amplify Gen 2)

One Amplify Gen 2 app that holds:

- **The website** (Astro, static): landing page, privacy policy, terms of
  use, support. Served by Amplify Hosting.
- **The map-data CDN** (`amplify/custom/mapData`): a private S3 bucket
  behind CloudFront for the app's region boundary files and map style.
  Defined as custom CDK resources in `amplify/backend.ts`, so Amplify
  deploys it with the site; no separate CloudFormation stacks.

```
web/
  amplify/backend.ts              Gen 2 backend: adds the MapData stack
  amplify/custom/mapData/         S3 + CloudFront (OAC, HTTPS, gzip/brotli, 404s)
  src/site.ts                     publisher, support email, store links (fill in)
  src/pages/                      index, privacy, terms, support, 404
  scripts/upload-map-data.sh      publish boundary files + map style to the CDN
  scripts/synth.mjs               synthesize the backend locally and check it
```

## First deployment

1. Fill in `src/site.ts` (publisher, support email, governing law, date).
   The build lists any placeholders left.
2. In the Amplify console: **Create new app** → GitHub → this repository and
   branch → tick **My app is a monorepo** and enter `web` as the root. The
   repository's `amplify.yml` handles the rest (Node 22, backend deploy,
   site build).
3. When the build finishes, the site is at
   `https://<branch>.<app-id>.amplifyapp.com`. Add your own domain under
   **Hosting → Custom domains** (e.g. `openworldlife.com`).

## Publishing map data

After each planet build (`pipeline/README.md`):

```bash
cd web
npx ampx generate outputs --app-id <amplify-app-id> --branch main   # writes amplify_outputs.json
scripts/upload-map-data.sh /path/to/pipeline-output                 # needs the AWS CLI
```

The script uploads to a new dated folder (`boundaries/v1-YYYY-MM-DD/`) and a
content-named style file (`map/style-<hash>.json`), marks them immutable
with a one-year cache, and prints the URLs. Put them in `eas.json` under
`build.production.env`, along with the site:

```json
"env": {
  "BOUNDARIES_URL": "https://dxxxx.cloudfront.net/boundaries/v1-2026-10-11",
  "MAP_STYLE_URL": "https://dxxxx.cloudfront.net/map/style-0cb856595ee7.json",
  "WEBSITE_URL": "https://openworldlife.com"
}
```

Production app builds refuse to build without all three. Because uploads
never overwrite files, there's nothing to invalidate in CloudFront; old
folders can be deleted once no released app version uses them.

## Working on it

```bash
npm install
npm run dev          # the site at http://localhost:4321
npm run typecheck    # site (astro check) and backend
npm run synth        # synthesize the backend and check the CDN settings, no AWS account needed
npx ampx sandbox     # optional: a personal cloud copy of the backend
```

`npm install` is used instead of `npm ci` (also in `amplify.yml`):
`@aws-amplify/data-construct` bundles a package whose own dependency isn't
bundled, which `npm ci` reports as an out-of-sync lockfile.

## Notes

- **Custom domain for the CDN** (e.g. `data.openworldlife.com`): needs an
  ACM certificate in us-east-1 and the domain on the distribution; add both
  in `amplify/custom/mapData/resource.ts`. Not required: the app doesn't show
  the CDN address.
- **Removal:** the bucket is kept if the stack is deleted (rebuilding the
  planet takes hours). Delete it by hand if you really mean to.
- **Branches:** every Amplify branch gets its own bucket and CDN. Publish
  data to the one the store builds point at (normally `main`).
