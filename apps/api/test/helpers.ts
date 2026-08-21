 
import { vi } from 'vitest';
import type { Queue } from 'bullmq';
import { signAuthToken } from '@jecrc/auth';

export const mockConfig = {
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
  ENCRYPTION_KEY: Buffer.from('a'.repeat(32)).toString('base64'),
  JWT_SECRET: 'this-is-a-test-jwt-secret-at-least-32-chars-long',
  JWT_EXPIRES_IN: '24h',
} as any;

export const mockQueue = {
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  close: vi.fn(),
} as any;

export function createTestToken(userId = 'user-1'): string {
  return signAuthToken(userId, mockConfig.JWT_SECRET, mockConfig.JWT_EXPIRES_IN);
}

export function makeTestDeps(extra: Record<string, unknown> = {}) {
  return {
    prisma: extra.prisma ?? ({} as any),
    config: mockConfig,
    checkPostgres: (extra.checkPostgres as () => Promise<void>) ?? vi.fn(),
    checkRedis: (extra.checkRedis as () => Promise<void>) ?? vi.fn(),
    webOrigin: 'http://localhost:5173',
    emailSyncQueue: (extra.emailSyncQueue as Queue) ?? mockQueue,
    emailRescanQueue: (extra.emailRescanQueue as Queue) ?? mockQueue,
  };
}
