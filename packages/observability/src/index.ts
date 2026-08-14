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

let globalLogLevel: string | undefined;

/**
 * Sets the global log level used by all getLogger() calls.
 * Should be called once at startup with the configured LOG_LEVEL.
 */
export function setGlobalLogLevel(level: string): void {
  globalLogLevel = level;
}

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
 * Uses the global log level set via setGlobalLogLevel() if no explicit level is provided.
 * @param name - Logger name for context
 * @param level - Optional log level (defaults to the global level or 'info')
 */
export function getLogger(name: string, level?: string): Logger {
  const loggerLevel = level ?? globalLogLevel ?? 'info';
  const logger = createLogger(loggerLevel);
  return logger.child({ name });
}
