import assert from 'node:assert/strict';
import test from 'node:test';
import { planTaskResume } from '../src/lib/marketing-studio/resume.ts';
import {
  selectInternalTask,
  taskOutputUrls,
} from '../src/lib/marketing-studio/task-outputs.ts';

test('a new generation charges both image and video submissions', () => {
  assert.deepEqual(planTaskResume(undefined, 5, 76), {
    hasExistingWork: false,
    hasPendingTask: false,
    needsImageSubmission: true,
    needsVideoSubmission: true,
    remainingCost: 81,
  });
});

test('an accepted image task is polled without charging the image again', () => {
  const plan = planTaskResume({ imgGetUrl: 'image-task' }, 5, 76);
  assert.equal(plan.hasPendingTask, true);
  assert.equal(plan.needsImageSubmission, false);
  assert.equal(plan.needsVideoSubmission, true);
  assert.equal(plan.remainingCost, 76);
});

test('an accepted video task resumes with zero additional credits', () => {
  const plan = planTaskResume({
    imgUrl: '/media/image.png',
    vidGetUrl: 'video-task',
  }, 5, 76);
  assert.equal(plan.hasPendingTask, true);
  assert.equal(plan.needsImageSubmission, false);
  assert.equal(plan.needsVideoSubmission, false);
  assert.equal(plan.remainingCost, 0);
});

test('a refunded terminal video failure reuses the completed image', () => {
  const plan = planTaskResume({ imgUrl: '/media/image.png' }, 5, 76);
  assert.equal(plan.hasPendingTask, false);
  assert.equal(plan.needsImageSubmission, false);
  assert.equal(plan.needsVideoSubmission, true);
  assert.equal(plan.remainingCost, 76);
});

test('normalizes cached task outputs from Prisma or raw D1 JSON', () => {
  assert.deepEqual(taskOutputUrls(['/media/a.mp4', '', null]), ['/media/a.mp4']);
  assert.deepEqual(taskOutputUrls('[\"/media/b.mp4\"]'), ['/media/b.mp4']);
  assert.deepEqual(taskOutputUrls('not-json'), []);
});

test('selects the charged internal task when a parent creation shares its getUrl', () => {
  const parent = { id: 'parent', templateId: 'marketing-studio', cost: 0 };
  const internal = { id: 'task', templateId: 'mk-shot', cost: 121 };
  assert.equal(selectInternalTask([parent, internal])?.id, 'task');
});

test('selects BYOK internal tasks even when their recorded cost is zero', () => {
  const parent = { id: 'parent', templateId: 'marketing-studio', cost: 0 };
  const internal = { id: 'task', templateId: 'mk-shot', cost: 0 };
  assert.equal(selectInternalTask([parent, internal])?.id, 'task');
});
