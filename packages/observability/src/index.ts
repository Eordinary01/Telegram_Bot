import pino, { type Logger } from 'pino';

const redactedPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  '*.accessToken',
  '*.refreshToken',
  '*.encryptedRefreshToken',
  '*.encryptionIv',
  '*.encryptionAuthTag',
  '*.clientSecret',
  '*.telegramBotToken',
  '*.ENCRYPTION_KEY',
  '*.JWT_SECRET',
  '*.GOOGLE_CLIENT_SECRET',
];

export function createLogger(level = 'info'): Logger {
  return pino({
    level,
    redact: {
      paths: redactedPaths,
      censor: '[REDACTED]',
    },
  });
}

/**
 * Creates a child logger with a specific name/context.
 * @param name - Logger name for context
 * @param level - Optional log level (defaults to 'info')
 */
export function getLogger(name: string, level = 'info'): Logger {
  const logger = createLogger(level);
  return logger.child({ name });
}
