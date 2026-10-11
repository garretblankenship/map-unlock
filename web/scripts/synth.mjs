// Synthesizes the Amplify backend locally (no AWS account needed) and checks
// the map-data CDN in the generated CloudFormation: private bucket, HTTPS,
// compression, 404s for missing files, worldwide edge locations.
//   npm run synth
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';

rmSync('cdk.out', { recursive: true, force: true });
execFileSync(
  'npx',
  [
    'cdk', 'synth', '--quiet',
    '--app', 'npx tsx amplify/backend.ts',
    '-c', 'amplify-backend-namespace=openworldlife',
    '-c', 'amplify-backend-name=main',
    '-c', 'amplify-backend-type=branch',
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

const file = readdirSync('cdk.out').find((f) => f.includes('MapData') && f.endsWith('.nested.template.json'));
assert(file, 'MapData nested stack was not synthesized');
const resources = Object.values(JSON.parse(readFileSync(`cdk.out/${file}`, 'utf8')).Resources);
const ofType = (t) => resources.filter((r) => r.Type === t);

const [bucket] = ofType('AWS::S3::Bucket');
assert.equal(bucket.DeletionPolicy, 'Retain', 'bucket survives stack deletion');
assert.deepEqual(bucket.Properties.PublicAccessBlockConfiguration, {
  BlockPublicAcls: true,
  BlockPublicPolicy: true,
  IgnorePublicAcls: true,
  RestrictPublicBuckets: true,
});
assert.equal(bucket.Properties.BucketEncryption.ServerSideEncryptionConfiguration[0].ServerSideEncryptionByDefault.SSEAlgorithm, 'AES256');

const [dist] = ofType('AWS::CloudFront::Distribution');
const config = dist.Properties.DistributionConfig;
assert.equal(config.DefaultCacheBehavior.ViewerProtocolPolicy, 'https-only');
assert.equal(config.DefaultCacheBehavior.Compress, true);
assert.deepEqual(config.DefaultCacheBehavior.AllowedMethods, ['GET', 'HEAD']);
assert.equal(config.PriceClass, 'PriceClass_All');
assert.equal(config.HttpVersion, 'http2and3');
assert(config.Origins[0].OriginAccessControlId, 'S3 origin uses origin access control');
assert.equal(ofType('AWS::CloudFront::OriginAccessControl').length, 1);

const [cache] = ofType('AWS::CloudFront::CachePolicy');
const encodings = cache.Properties.CachePolicyConfig.ParametersInCacheKeyAndForwardedToOrigin;
assert.equal(encodings.EnableAcceptEncodingGzip, true);
assert.equal(encodings.EnableAcceptEncodingBrotli, true);
assert.equal(cache.Properties.CachePolicyConfig.DefaultTTL, 365 * 24 * 3600);

const statements = ofType('AWS::S3::BucketPolicy').flatMap((p) => p.Properties.PolicyDocument.Statement);
const fromCloudFront = (action) =>
  statements.find(
    (s) => s.Effect === 'Allow' && [s.Action].flat().includes(action) && s.Principal?.Service === 'cloudfront.amazonaws.com',
  );
assert(fromCloudFront('s3:GetObject'), 'CloudFront can read objects');
const list = fromCloudFront('s3:ListBucket');
assert(list, 'CloudFront can list the bucket, so missing files are 404s');
assert(list.Condition?.StringEquals?.['AWS:SourceArn'], 'listing is limited to this distribution');
assert(!statements.some((s) => s.Effect === 'Allow' && s.Principal === '*'), 'nothing is public');

console.log('Backend synthesized; map-data CDN checks passed.');
