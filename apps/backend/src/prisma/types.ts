import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** Cliente Prisma ou cliente de transação: permite que services participem de transações. */
export type DbClient = PrismaClient | Prisma.TransactionClient;
