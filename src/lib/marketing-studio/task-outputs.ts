export function taskOutputUrls(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (output): output is string => typeof output === 'string' && output.length > 0,
  );
}

type TaskCandidate = {
  templateId: string;
  cost: number;
};

export function isInternalTaskTemplate(templateId: string): boolean {
  return templateId.includes(':') || templateId.endsWith('-shot');
}

/**
 * 同一个 Atlas getUrl 可能同时挂在“作品占位”和内部扣费任务上。
 * 状态认领、退款和持久化必须落到内部任务，不能误操作 cost=0 的作品占位。
 */
export function selectInternalTask<T extends TaskCandidate>(tasks: T[]): T | undefined {
  return tasks.find((task) => isInternalTaskTemplate(task.templateId))
    || tasks.find((task) => task.cost > 0)
    || tasks[0];
}
