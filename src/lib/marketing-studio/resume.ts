export type ResumableMediaState = {
  imgUrl?: string;
  vidUrl?: string;
  imgGetUrl?: string;
  vidGetUrl?: string;
};

export type ResumePlan = {
  hasExistingWork: boolean;
  hasPendingTask: boolean;
  needsImageSubmission: boolean;
  needsVideoSubmission: boolean;
  remainingCost: number;
};

/**
 * Decide which paid submissions are still missing.
 *
 * A getUrl proves that Atlas already accepted and charged that step. Continuing
 * to poll it must therefore cost zero, even after a refresh or gateway outage.
 */
export function planTaskResume(
  state: ResumableMediaState | undefined,
  imageCost: number,
  videoCost: number,
): ResumePlan {
  const current = state || {};
  const hasExistingWork = !!(current.imgUrl || current.vidUrl || current.imgGetUrl || current.vidGetUrl);
  const hasPendingTask = !!(
    (current.imgGetUrl && !current.imgUrl)
    || (current.vidGetUrl && !current.vidUrl)
  );
  const needsImageSubmission = !(current.imgUrl || current.imgGetUrl || current.vidGetUrl || current.vidUrl);
  const needsVideoSubmission = !(current.vidUrl || current.vidGetUrl);

  return {
    hasExistingWork,
    hasPendingTask,
    needsImageSubmission,
    needsVideoSubmission,
    remainingCost: (needsImageSubmission ? imageCost : 0) + (needsVideoSubmission ? videoCost : 0),
  };
}
