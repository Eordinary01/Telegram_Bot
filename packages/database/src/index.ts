import { PrismaClient } from '@prisma/client';

export type {
  PrismaClient,
  User,
  GmailToken,
  WatchRegistration,
  SyncState,
  Email,
} from '@prisma/client';

let prismaClient: PrismaClient | undefined;

/**
 * Appends connection pool parameters to DATABASE_URL if not already present.
 * Pool params: connection_limit=10, pool_timeout=10000, idle_timeout=600000 (10min).
 */
function withPoolParams(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', '10');
  }
  if (!parsed.searchParams.has('pool_timeout')) {
    parsed.searchParams.set('pool_timeout', '10000');
  }
  if (!parsed.searchParams.has('idle_timeout')) {
    parsed.searchParams.set('idle_timeout', '600000');
  }
  return parsed.toString();
}

export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    const url = process.env['DATABASE_URL'];
    if (url) {
      process.env['DATABASE_URL'] = withPoolParams(url);
    }
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

export async function checkPostgresConnection(): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.$queryRaw`SELECT 1`;
}

export async function disconnectPostgres(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = undefined;
  }
}
