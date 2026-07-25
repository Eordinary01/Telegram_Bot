import { getConfig } from '@jecrc/config';

import { checkPostgresConnection, disconnectPostgres } from './index.js';

getConfig();

try {
  await checkPostgresConnection();
  process.stdout.write('PostgreSQL connection successful.\n');
} catch (error) {
  process.stderr.write(
    `PostgreSQL connection failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await disconnectPostgres();
}
