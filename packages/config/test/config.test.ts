import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { getConfig } from '../src/index.js';

const validEnvironment = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '3000',
  WEB_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  REDIS_URL: 'redis://localhost:6379',
  ALLOWED_SENDER_DOMAIN: 'JECRCU.EDU.IN',
  GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3000/auth/google/callback',
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  // Optional Pub/Sub fields
  GMAIL_PUSH_ENDPOINT: 'http://localhost:3000/webhooks/gmail',
  PUBSUB_TOPIC: 'projects/test-project/topics/gmail-push',
};

describe('getConfig', () => {
  it('parses and normalizes a valid environment', () => {
    const config = getConfig(validEnvironment);

    expect(config.API_PORT).toBe(3000);
    expect(config.ALLOWED_SENDER_DOMAIN).toBe('jecrcu.edu.in');
    expect(config.GOOGLE_CLIENT_ID).toBe('test-client-id.apps.googleusercontent.com');
  });

  it('accepts optional Pub/Sub configuration', () => {
    const config = getConfig(validEnvironment);

    expect(config.GMAIL_PUSH_ENDPOINT).toBe('http://localhost:3000/webhooks/gmail');
    expect(config.PUBSUB_TOPIC).toBe('projects/test-project/topics/gmail-push');
  });

  it('works without optional Pub/Sub configuration', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { GMAIL_PUSH_ENDPOINT, PUBSUB_TOPIC, ...envWithoutPubSub } = validEnvironment;

    const config = getConfig(envWithoutPubSub);

    expect(config.GMAIL_PUSH_ENDPOINT).toBeUndefined();
    expect(config.PUBSUB_TOPIC).toBeUndefined();
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      getConfig({
        ...validEnvironment,
        DATABASE_URL: 'mysql://localhost/database',
      }),
    ).toThrow('DATABASE_URL must use the postgresql:// protocol');
  });
});
