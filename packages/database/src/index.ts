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

export function getPrismaClient(): PrismaClient {
  prismaClient ??= new PrismaClient();
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
