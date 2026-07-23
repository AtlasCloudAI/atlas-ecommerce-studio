import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const cache = new WeakMap<object, PrismaClient>();

function makeClient(): PrismaClient {
  const { env } = getCloudflareContext();
  const db = (env as unknown as { DB?: object }).DB;
  if (!db) {
    throw new Error('D1 binding "DB" not found — check wrangler.jsonc d1_databases');
  }
  let client = cache.get(env as object);
  if (!client) {
    client = new PrismaClient({
      adapter: new PrismaD1(db as ConstructorParameters<typeof PrismaD1>[0]),
    });
    cache.set(env as object, client);
  }
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = makeClient();
    const value = Reflect.get(client, property);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
