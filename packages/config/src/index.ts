import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must use the postgresql:// protocol',
    }),
  REDIS_URL: z
    .string()
    .url()
    .refine((value) => value.startsWith('redis://') || value.startsWith('rediss://'), {
      message: 'REDIS_URL must use the redis:// or rediss:// protocol',
    }),
  ALLOWED_SENDER_DOMAIN: z
    .string()
    .trim()
    .default('')
    .transform((value) => value.toLowerCase()),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  JWT_SECRET: z.string().min(32, {
    message: 'JWT_SECRET must be at least 32 characters',
  }),
  JWT_EXPIRES_IN: z.string().min(1).default('24h'),
  ENCRYPTION_KEY: z
    .string()
    .min(1)
    .refine(
      (value) => {
        try {
          const decoded = Buffer.from(value, 'base64');
          return decoded.length === 32;
        } catch {
          return false;
        }
      },
      { message: 'ENCRYPTION_KEY must be a 32-byte base64-encoded string' },
    ),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  GMAIL_PUSH_ENDPOINT: z.string().url().optional(),
  PUBSUB_TOPIC: z
    .string()
    .regex(/^projects\/[^/]+\/topics\/[^/]+$/, {
      message: 'PUBSUB_TOPIC must be in format: projects/PROJECT_ID/topics/TOPIC_NAME',
    })
    .optional(),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional(),
});

export type AppConfig = z.infer<typeof environmentSchema>;

let cachedConfig: AppConfig | undefined;

function findEnvironmentFile(startDirectory: string): string | undefined {
  let directory = startDirectory;
  const root = parse(directory).root;

  while (true) {
    const candidate = join(directory, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }
    if (directory === root) {
      return undefined;
    }
    directory = dirname(directory);
  }
}

export function getConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  if (environment === process.env && cachedConfig) {
    return cachedConfig;
  }

  if (environment === process.env) {
    const environmentFile = findEnvironmentFile(process.cwd());
    if (environmentFile) {
      loadDotenv({ path: environmentFile, quiet: true });
    } else {
      loadDotenv({ quiet: true });
    }
  }

  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  if (environment === process.env) {
    cachedConfig = result.data;
  }

  return result.data;
}
