import { getConfig } from '@jecrc/config';

import { checkRedisConnection, disconnectRedis } from './index.js';

const config = getConfig();

try {
  await checkRedisConnection(config.REDIS_URL);
  process.stdout.write('Redis connection successful.\n');
} catch (error) {
  process.stderr.write(
    `Redis connection failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await disconnectRedis();
}
