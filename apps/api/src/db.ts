import './config.js';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  log: [],
});
export type Tx = Prisma.TransactionClient;
export const transaction = <T>(fn: (tx: Tx) => Promise<T>) =>
  db.$transaction(fn, { maxWait: 15000, timeout: 20000 });
