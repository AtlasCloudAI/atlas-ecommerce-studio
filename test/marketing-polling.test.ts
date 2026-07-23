import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PollInterruptedError,
  PollTerminalError,
  pollUntilComplete,
  type PollResponse,
} from '../src/lib/marketing-studio/polling.ts';

test('keeps transient gateway errors recoverable and never overlaps requests', async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  let clock = 0;

  const output = await pollUntilComplete({
    getUrl: 'https://api.atlascloud.ai/api/v1/model/prediction/task',
    timeoutMs: 10_000,
    intervalMs: 1,
    now: () => clock,
    wait: async (ms) => { clock += ms; },
    request: async (): Promise<PollResponse> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      calls += 1;
      await Promise.resolve();
      active -= 1;
      return calls <= 12
        ? { status: 'processing', transient: true }
        : { status: 'completed', outputs: ['/media/result.mp4'] };
    },
  });

  assert.equal(output, '/media/result.mp4');
  assert.equal(calls, 13);
  assert.equal(maxActive, 1);
});

test('recovers from request exceptions without resubmitting the task', async () => {
  let calls = 0;
  let clock = 0;
  const output = await pollUntilComplete({
    getUrl: 'task-url',
    timeoutMs: 1_000,
    intervalMs: 1,
    now: () => clock,
    wait: async (ms) => { clock += ms; },
    request: async () => {
      calls += 1;
      if (calls < 3) throw new Error('Atlas poll 504');
      return { status: 'completed', outputs: ['/media/recovered.mp4'] };
    },
  });

  assert.equal(output, '/media/recovered.mp4');
  assert.equal(calls, 3);
});

test('surfaces a terminal Atlas failure immediately', async () => {
  await assert.rejects(
    pollUntilComplete({
      getUrl: 'task-url',
      request: async () => ({ status: 'failed', error: 'content_blocked' }),
    }),
    (error: unknown) => error instanceof PollTerminalError && error.message === 'content_blocked',
  );
});

test('pauses recoverably after the overall polling deadline', async () => {
  let clock = 0;
  await assert.rejects(
    pollUntilComplete({
      getUrl: 'task-url',
      timeoutMs: 3,
      intervalMs: 1,
      now: () => clock,
      wait: async (ms) => { clock += ms; },
      request: async () => ({ status: 'processing', transient: true }),
    }),
    (error: unknown) => error instanceof PollInterruptedError,
  );
});
