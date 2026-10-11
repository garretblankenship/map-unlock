// Android backup rules: back up the player's progress database and nothing
// else. Android's cloud backup stops working entirely once an app's data
// passes 25 MB, and saved offline maps (MapLibre's database in the app's
// files folder) easily exceed that. Everything left out can be downloaded
// again. iOS needs no rules: the progress database is in Documents, which
// iCloud backs up, and MapLibre excludes its own database from backup.
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

// Must match PROGRESS_DB in src/services/db.ts. expo-sqlite keeps databases
// in files/SQLite/; the -wal file holds recent writes not yet merged in.
const PROGRESS_FILES = ['SQLite/mapunlock.db', 'SQLite/mapunlock.db-wal'];

const includes = (indent) =>
  PROGRESS_FILES.map((p) => `${indent}<include domain="file" path="${p}" />`).join('\n');

// Android 11 and older.
const FULL_BACKUP = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${includes('  ')}
</full-backup-content>
`;

// Android 12 and newer: cloud backups and phone-to-phone transfers.
const DATA_EXTRACTION = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
${includes('    ')}
  </cloud-backup>
  <device-transfer>
${includes('    ')}
  </device-transfer>
</data-extraction-rules>
`;

const withBackupRules = (config) => {
  config = withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'backup_rules.xml'), FULL_BACKUP);
      fs.writeFileSync(path.join(dir, 'data_extraction_rules.xml'), DATA_EXTRACTION);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.$['android:allowBackup'] = 'true';
    app.$['android:fullBackupContent'] = '@xml/backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    return cfg;
  });
};

module.exports = withBackupRules;
