import { Redis } from 'ioredis';

let redisClient: Redis | undefined;

export function getRedisClient(redisUrl: string): Redis {
  const parsed = parseRedisConnection(redisUrl);
  redisClient ??= new Redis({
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
    password: parsed.password,
    tls: parsed.tls,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  redisClient.on('error', () => undefined);
  return redisClient;
}


export async function checkRedisConnection(redisUrl: string): Promise<void> {
  const redis = getRedisClient(redisUrl);
  if (redis.status === 'wait') {
    await redis.connect();
  }
  await redis.ping();
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    if (redisClient.status !== 'end') {
      await redisClient.quit();
    }
    redisClient = undefined;
  }
}

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: object;
  maxRetriesPerRequest?: null | number;
}

export function parseRedisConnection(redisUrlStr: string): RedisConnectionOptions {
  const url = new URL(redisUrlStr);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}


export {
  type SyncUserEmailsJob,
  type ProcessEmailJob,
  type RenewWatchJob,
  type ReminderCheckJob,
  type RescanEmailsJob,
  QueueNames,
} from './jobs.js';
