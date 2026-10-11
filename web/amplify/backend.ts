import { defineBackend } from '@aws-amplify/backend';

import { MapData } from './custom/mapData/resource';

/**
 * The Open World Life website's Amplify Gen 2 backend. The site itself is
 * static (Amplify Hosting serves it); the backend adds the CDN the mobile
 * app downloads map data from.
 */
const backend = defineBackend({});

const mapData = new MapData(backend.createStack('MapData'), 'MapData');

backend.addOutput({
  custom: {
    mapDataBucket: mapData.bucket.bucketName,
    mapDataUrl: `https://${mapData.distribution.distributionDomainName}`,
  },
});
