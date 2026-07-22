/**
 * Atlas Cloud generation client.
 *
 * Submit async task -> poll until completed. Never long-poll inside one
 * serverless request: submitGen returns { id, getUrl } immediately, and the
 * client polls /api/creations/[id] which calls pollOnce once per request.
 *
 * The browser User-Agent header is required to get past Cloudflare (err 1010).
 *
 * NOTE on input-image field names — they differ by model:
 *   - image-edit (seedream/qwen .../edit): plural `images`
 *   - seedance image-to-video:            singular `image`
 * so each template declares its own `imageField`.
 */
import { getRequestAtlasKey } from '@/lib/request-context';

const BASE = process.env.ATLASCLOUD_BASE || 'https://api.atlascloud.ai/api/v1';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function apiKey(): string {
  // BYOK: a user-supplied key (x-atlas-key header) takes priority over the platform key.
  const k = getRequestAtlasKey() || process.env.ATLASCLOUD_API_KEY;
  if (!k) throw new Error('ATLASCLOUD_API_KEY is not set');
  return k;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(path: string, payload: Record<string, unknown>, retries = 5): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000); // 单次提交 30s 超时,防 fetch 挂起被平台 maxDuration 强杀→扣费不退
    try {
      const res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          'Content-Type': 'application/json',
          'User-Agent': UA,
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) return res.json();
      const body = await res.text();
      const err = new Error(`Atlas ${res.status}: ${body}`);
      // 4xx 是客户端错误(参数/鉴权/余额),重试无意义 → 立即失败,尽快把 Atlas 原文暴露出来。
      if (res.status < 500) throw Object.assign(err, { noRetry: true });
      lastErr = err;
    } catch (e) {
      if ((e as { noRetry?: boolean })?.noRetry) throw e;
      lastErr = e; // 含 AbortError(提交超时):进入下一次重试
    } finally {
      clearTimeout(timer);
    }
    await sleep(2000 * (i + 1));
  }
  throw lastErr;
}

export async function submitRawGen(
  endpoint: 'generateImage' | 'generateVideo' | 'generateAudio',
  payload: Record<string, unknown>,
): Promise<SubmitResult> {
  const resp = await post(`/model/${endpoint}`, payload);
  if (Number(resp.code) !== 200) throw new Error(`Atlas submit failed: ${JSON.stringify(resp)}`);
  const d = resp.data;
  return { id: d.id, getUrl: d?.urls?.get || `${BASE}/model/prediction/${d.id}` };
}

async function get(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000); // 查询 25s 超时
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey()}`, 'User-Agent': UA },
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (e) {
    // 超时/中断:抛成 timeout —— poll route 会当网关瞬时错误(前端继续轮询,不误判整体失败)
    throw new Error(`Atlas poll timeout: ${String((e as Error)?.message || e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Atlas poll ${res.status}: ${await res.text()}`);
  return res.json();
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; extension: string } {
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (!match) throw new Error('invalid data url');
  const mime = match[1];
  const body = match[3];
  const bytes = match[2]
    ? Buffer.from(body, 'base64')
    : Buffer.from(decodeURIComponent(body), 'utf8');
  const extension =
    mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('mp4')
          ? 'mp4'
          : mime.includes('mpeg') || mime.includes('mp3')
            ? 'mp3'
            : mime.includes('wav')
              ? 'wav'
              : mime.includes('webm')
                ? 'webm'
                : mime.includes('quicktime')
                  ? 'mov'
                  : 'bin';
  return { blob: new Blob([bytes], { type: mime }), extension };
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function mediaExtension(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('mp4')) return 'mp4';
  if (ct.includes('quicktime')) return 'mov';
  if (ct.includes('webm')) return 'webm';
  if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
  if (ct.includes('wav')) return 'wav';
  if (ct.includes('m4a')) return 'm4a';
  return 'bin';
}

function sniffMedia(bytes: Uint8Array, declared: string): { contentType: string; extension: string } {
  if (bytes.length >= 12) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { contentType: 'image/jpeg', extension: 'jpg' };
    }
    if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') {
      return { contentType: 'image/png', extension: 'png' };
    }
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
      return { contentType: 'image/webp', extension: 'webp' };
    }
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WAVE') {
      return { contentType: 'audio/wav', extension: 'wav' };
    }
    if (ascii(bytes, 4, 8) === 'ftyp') {
      const brand = ascii(bytes, 8, 12);
      return brand === 'qt  '
        ? { contentType: 'video/quicktime', extension: 'mov' }
        : { contentType: 'video/mp4', extension: 'mp4' };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { contentType: 'video/webm', extension: 'webm' };
  }
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === 'ID3') {
    return { contentType: 'audio/mpeg', extension: 'mp3' };
  }
  return { contentType: declared || 'application/octet-stream', extension: mediaExtension(declared) };
}

export async function uploadBlobToAtlas(blob: Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append('file', blob, filename);
  const res = await fetch(`${BASE}/model/uploadMedia`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'User-Agent': UA,
    },
    body: form,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Atlas upload ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data?.data?.download_url || data?.data?.url || data?.download_url || data?.url;
  if (typeof url !== 'string' || !url) throw new Error(`Atlas upload returned no URL: ${JSON.stringify(data)}`);
  return url;
}

export async function uploadMedia(dataUrl: string, filenamePrefix = 'media'): Promise<string> {
  const { blob, extension } = dataUrlToBlob(dataUrl);
  return uploadBlobToAtlas(blob, `${filenamePrefix}.${extension}`);
}

export async function uploadRemoteMediaToAtlas(
  sourceUrl: string,
  filenamePrefix = 'media',
  maxBytes = 200_000_000,
): Promise<string> {
  const res = await fetch(sourceUrl, { headers: { 'User-Agent': UA }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Media fetch ${res.status}: ${await res.text()}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error(`media_too_large:${len}`);
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error(`media_too_large:${buffer.byteLength}`);
  const declared = res.headers.get('content-type') || 'application/octet-stream';
  const meta = sniffMedia(new Uint8Array(buffer), declared);
  return uploadBlobToAtlas(new Blob([buffer], { type: meta.contentType }), `${filenamePrefix}.${meta.extension}`);
}

export interface GenInput {
  endpoint: 'generateImage' | 'generateVideo' | 'generateAudio';
  model: string;
  prompt?: string;
  /** audio generation text prompt */
  text?: string;
  /** input image (http url or data: URI) */
  image?: string;
  /** multiple input images (http urls or data: URIs) */
  images?: string[];
  /** which payload key the model expects the input image under */
  imageField?: 'image' | 'images';
  /** extra model params, e.g. { duration: 5, resolution: '720p' } */
  extra?: Record<string, unknown>;
}

export interface SubmitResult {
  id: string;
  getUrl: string;
}

export async function submitGen(input: GenInput): Promise<SubmitResult> {
  const payload: Record<string, unknown> = { model: input.model };
  if (input.prompt) payload.prompt = input.prompt;
  if (input.text) payload.text = input.text;
  if (input.images?.length) {
    const field = input.imageField || 'images';
    payload[field] = field === 'images' ? input.images : input.images[0];
  } else if (input.image) {
    const field = input.imageField || 'images';
    payload[field] = field === 'images' ? [input.image] : input.image;
  }
  Object.assign(payload, input.extra || {});

  return submitRawGen(input.endpoint, payload);
}

export type AtlasStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PollResult {
  status: AtlasStatus;
  outputs: string[];
  error?: string;
  raw: any;
}

function outputUrl(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const url = record.url || record.download_url || record.output || record.uri;
  return typeof url === 'string' ? url : '';
}

function errorText(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return String(value).slice(0, 500);
  }
}

/** One poll request against the task's get URL. Safe for serverless. */
export async function pollOnce(getUrl: string): Promise<PollResult> {
  const r = await get(getUrl);
  const d = r?.data ?? r;
  const rawStatus = String(d?.status ?? 'processing').toLowerCase();
  const status: AtlasStatus =
    rawStatus === 'completed' || rawStatus === 'succeeded' || rawStatus === 'success'
      ? 'completed'
      : rawStatus === 'failed' || rawStatus === 'error' || rawStatus === 'canceled' || rawStatus === 'cancelled'
        ? 'failed'
        : rawStatus === 'pending' || rawStatus === 'starting' || rawStatus === 'queued'
          ? 'pending'
          : 'processing';
  const rawOutputs = Array.isArray(d?.outputs)
    ? d.outputs
    : Array.isArray(d?.output)
      ? d.output
      : d?.output
        ? [d.output]
        : [];
  const outputs = rawOutputs.map(outputUrl).filter(Boolean);
  return {
    status,
    outputs,
    error: errorText(d?.error),
    raw: d,
  };
}

const LLM_BASE = process.env.ATLASCLOUD_LLM_BASE || 'https://api.atlascloud.ai/v1';
export const DEFAULT_CHAT_MODEL = process.env.ATLASCLOUD_CHAT_MODEL || 'bytedance/doubao-seed-2.1-turbo-260628';
const CHAT_TIMEOUT_MS = Number(process.env.ATLASCLOUD_CHAT_TIMEOUT_MS || 45000);

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
}

export async function atlasChat(
  messages: ChatMessage[],
  model = DEFAULT_CHAT_MODEL,
  maxTokens: number | null = 900,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${LLM_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        'User-Agent': UA,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        // maxTokens=null → 不传 max_tokens,让模型用默认上限。带 thinking 的模型(gemini-2.5)
        // 若上限太小,推理会先吃掉预算、正文被 length 截断(见 ad-reference 口播台词/marketing 扩写被截)。
        ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
        stream: false,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Atlas chat ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('Atlas chat returned empty content');
    return content.trim();
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Atlas chat timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
