import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// Cloudflare D1:binding 只能在请求上下文里通过 getCloudflareContext() 拿到,模块级拿不到。
// 用 Proxy 让 `prisma` 对外仍是"单例"的样子——每次访问在当前请求里懒创建一个绑到 D1 的 client,
// 并按 env 缓存(同一请求复用)。这样 next-auth 的 PrismaAdapter(prisma) 和所有 `import { prisma }`
// 都无需改动,自动走 D1。彻底摆脱外部 Postgres(Neon 配额超额/跨境的问题)。
const cache = new WeakMap<object, PrismaClient>();

function makeClient(): PrismaClient {
  const { env } = getCloudflareContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (env as any).DB;
  if (!db) throw new Error('D1 binding "DB" not found — 检查 wrangler.jsonc d1_databases');
  let client = cache.get(env as object);
  if (!client) {
    client = new PrismaClient({ adapter: new PrismaD1(db) });
    cache.set(env as object, client);
  }
  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = makeClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
