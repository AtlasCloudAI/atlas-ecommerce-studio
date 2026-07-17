import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// OpenNext Cloudflare adapter. Prisma 用 queryCompiler(engineType=client)+ Neon driver adapter,
// 无 Rust 引擎 / 无 eval,可在 Workers(nodejs_compat)跑。
const config = defineCloudflareConfig({});

// next-auth v4 的 openid-client 需要 node:https 的 https.request();unenv 把它 stub 成
// notImplemented,而 workerd(2024-09-23+ nodejs_compat)已原生支持 node:http/https。
// 把它们从打包中 external 出去,运行时用 workerd 的真实现,而非 unenv 的 stub。
(config as unknown as { edgeExternals: string[] }).edgeExternals = [
  'node:crypto',
  'node:http',
  'node:https',
];

export default config;
