/**
 * Per-request context (BYOK — bring your own Atlas key).
 *
 * A user can paste their own AtlasCloud API key in the browser; the frontend
 * sends it on every generation request as the `x-atlas-key` header. When present:
 *   - every Atlas call in that request uses the user's key (see atlas.ts apiKey())
 *   - credits are NOT deducted (the user pays AtlasCloud directly — see credits.ts)
 *
 * We never persist the key server-side; it lives only in the browser's
 * localStorage and in the per-request AsyncLocalStorage store below.
 *
 * node:async_hooks only exists server-side (workerd via the nodejs_compat flag).
 * Client component graphs can transitively import this module (page → atlas.ts →
 * here), so the store is created LAZILY and node:async_hooks is aliased away in
 * the client bundle (see next.config.mjs). The client never calls these
 * functions, so the store is never constructed in the browser.
 */
// Bare 'async_hooks' (not 'node:async_hooks'): the node: scheme can't be handled
// by the client webpack pass (UnhandledSchemeError), but a bare specifier
// resolves normally server-side and is aliased to false for the browser bundle
// (see next.config.mjs). workerd (nodejs_compat) resolves it fine at runtime.
// eslint-disable-next-line import/no-nodejs-modules
import { AsyncLocalStorage } from 'async_hooks';

type RequestCtx = { atlasKey?: string };

let _store: AsyncLocalStorage<RequestCtx> | null = null;
function store(): AsyncLocalStorage<RequestCtx> {
  if (!_store) _store = new AsyncLocalStorage<RequestCtx>();
  return _store;
}

/** Run `fn` with the given user Atlas key bound to the current async context. */
export function runWithAtlas<T>(atlasKey: string | undefined, fn: () => T): T {
  return store().run({ atlasKey: atlasKey || undefined }, fn);
}

/** The user's Atlas key for the current request, if they supplied one (BYOK). */
export function getRequestAtlasKey(): string | undefined {
  return store().getStore()?.atlasKey;
}

/** True when the current request is running under a user-supplied key (skip billing). */
export function isByok(): boolean {
  return !!store().getStore()?.atlasKey;
}

/** Basic sanity check so we don't forward obvious garbage as a bearer token. */
function sanitizeKey(raw: string | null): string | undefined {
  const k = (raw || '').trim();
  if (!k) return undefined;
  // AtlasCloud keys look like `apikey-...`; keep it permissive but bounded.
  if (k.length < 8 || k.length > 200 || /\s/.test(k)) return undefined;
  return k;
}

/**
 * Wrap a Next.js route handler so any `x-atlas-key` header is bound to the
 * request context for its whole lifetime. Transparently passes through all
 * handler arguments (req, { params }, ...) and the return value.
 */
export function withAtlas<H extends (...args: never[]) => unknown>(handler: H): H {
  return ((...args: never[]) => {
    const req = args[0] as unknown as Request;
    const key = sanitizeKey(req?.headers?.get('x-atlas-key') ?? null);
    return runWithAtlas(key, () => handler(...args));
  }) as H;
}
