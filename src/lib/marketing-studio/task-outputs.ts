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
