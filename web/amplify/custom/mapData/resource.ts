import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Hosting for the data the app downloads: region boundary files (built by
 * ../../../pipeline) and the map style used for offline downloads.
 *
 * A private S3 bucket behind CloudFront. Files are uploaded to versioned
 * folders (boundaries/v1-2026-10-11/, map/style-<hash>.json) and never
 * change once uploaded, so they're cached for a year at the edge and on
 * phones. To publish new data, upload a new folder and point the app at it
 * (see ../../../scripts/upload-map-data.sh).
 */
export class MapData extends Construct {
  readonly bucket: s3.Bucket;
  readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'Bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Rebuilding the planet takes hours; don't lose it with the stack.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Files are immutable; the long default suits the versioned layout. The
    // upload script also sets Cache-Control on each object.
    const cachePolicy = new cloudfront.CachePolicy(this, 'CachePolicy', {
      comment: 'Open World Life map data: immutable, versioned files',
      defaultTtl: Duration.days(365),
      maxTtl: Duration.days(365),
      minTtl: Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    this.distribution = new cloudfront.Distribution(this, 'Cdn', {
      comment: 'Open World Life map data',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy,
        compress: true,
      },
      // The app is worldwide.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // Let CloudFront list the bucket so a missing file is a 404 rather than
    // a 403. The app reads a missing boundary tile as "no regions here".
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [this.bucket.bucketArn],
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:${Stack.of(this).partition}:cloudfront::${Stack.of(this).account}:distribution/${this.distribution.distributionId}`,
          },
        },
      }),
    );
  }
}
