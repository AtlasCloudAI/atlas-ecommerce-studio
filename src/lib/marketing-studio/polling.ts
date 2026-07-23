export type PollResponse = {
  status?: string;
  outputs?: unknown;
  error?: string;
  transient?: boolean;
};

export type PollRequest = (getUrl: string, signal?: AbortSignal) => Promise<PollResponse>;

export class PollTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollTerminalError';
  }
}

export class PollInterruptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PollInterruptedError';
  }
}

type PollOptions = {
  getUrl: string;
  request: PollRequest;
  signal?: AbortSignal;
  timeoutMs?: number;
  intervalMs?: number;
  maxErrorIntervalMs?: number;
  now?: () => number;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onTransient?: (message: string) => void;
};

const DEFAULT_TIMEOUT_MS = 90 * 60_000;
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_MAX_ERROR_INTERVAL_MS = 20_000;

function abortError(): PollInterruptedError {
  return new PollInterruptedError('poll_cancelled');
}

export function waitForPoll(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function firstOutput(outputs: unknown): string {
  if (!Array.isArray(outputs)) return '';
  return outputs.find((value): value is string => typeof value === 'string' && value.length > 0) || '';
}

/**
 * Poll one Atlas task sequentially.
 *
 * A status request can take up to 25 seconds on the server. Using setInterval
 * here would overlap requests and turn one gateway incident into many parallel
 * failures. This loop always waits for the current request to finish before
 * scheduling the next one.
 */
export async function pollUntilComplete(options: PollOptions): Promise<string> {
  const now = options.now || Date.now;
  const wait = options.wait || waitForPoll;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxErrorIntervalMs = options.maxErrorIntervalMs ?? DEFAULT_MAX_ERROR_INTERVAL_MS;
  const startedAt = now();
  let consecutiveErrors = 0;
  let lastError = 'poll_temporarily_unavailable';

  while (now() - startedAt < timeoutMs) {
    if (options.signal?.aborted) throw abortError();

    try {
      const response = await options.request(options.getUrl, options.signal);
      if (response.status === 'failed') {
        throw new PollTerminalError(response.error || 'generation_failed');
      }
      if (response.status === 'completed') {
        const output = firstOutput(response.outputs);
        if (!output) throw new PollTerminalError('empty_output');
        return output;
      }

      if (response.transient) {
        consecutiveErrors += 1;
        lastError = response.error || 'poll_gateway_unstable';
        options.onTransient?.(lastError);
      } else {
        consecutiveErrors = 0;
      }
    } catch (error) {
      if (error instanceof PollTerminalError || error instanceof PollInterruptedError) throw error;
      consecutiveErrors += 1;
      lastError = String((error as Error)?.message || error).slice(0, 240);
      options.onTransient?.(lastError);
    }

    const delay = consecutiveErrors > 0
      ? Math.min(intervalMs * Math.max(1, consecutiveErrors), maxErrorIntervalMs)
      : intervalMs;
    await wait(delay, options.signal);
  }

  throw new PollInterruptedError(lastError);
}
