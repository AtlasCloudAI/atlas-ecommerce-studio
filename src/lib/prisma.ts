import type { PrismaClient } from '@prisma/client';
import { prisma as platformPrisma } from '@/generated/platform/prisma';

// Both generated clients share the same models and public Prisma API. Expose a
// stable contract so next-auth does not recursively compare separate type graphs.
export const prisma = platformPrisma as unknown as PrismaClient;
