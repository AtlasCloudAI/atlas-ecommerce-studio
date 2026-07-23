import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@/generated/prisma/neon';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error('DATABASE_URL is required when deploying to Vercel/Neon');
}

const globalForPrisma = globalThis as unknown as {
  prismaNeon?: PrismaClient;
};

export const prisma =
  globalForPrisma.prismaNeon ??
  new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaNeon = prisma;
}
