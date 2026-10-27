export interface GuideAnswer { status: 'answered' | 'insufficient_evidence' | 'out_of_scope'; answer: string; citations: string[] }
export interface GuideConfig { enabled: boolean; maxQuestionCharacters: number; timeoutMs: number }

export function unwrapped(value: unknown): unknown {
  if (value && typeof value === 'object' && 'success' in value && value.success === true && 'data' in value) return value.data;
  return value;
}

export function safeCitation(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const lines = /^#L([1-9][0-9]*)-L([1-9][0-9]*)$/.exec(url.hash);
    return url.protocol === 'https:' && url.hostname === 'github.com' && !url.port && !url.username && !url.password && !url.search &&
      /^\/(?:dinkuskit|emdash-cms)\/[^/]+\/blob\/[a-f0-9]{40}\/[a-zA-Z0-9_./%-]+$/.test(url.pathname) &&
      Boolean(lines && Number.isSafeInteger(Number(lines[2])) && Number(lines[2]) >= Number(lines[1]));
  } catch { return false; }
}

export function parseAnswer(input: unknown): GuideAnswer {
  const value = unwrapped(input) as Partial<GuideAnswer> | null;
  if (!value || typeof value !== 'object' || !['answered', 'insufficient_evidence', 'out_of_scope'].includes(value.status ?? '') ||
      typeof value.answer !== 'string' || !value.answer.trim() || !Array.isArray(value.citations) ||
      value.citations.length > 50 || !value.citations.every(safeCitation) ||
      (value.status === 'answered') !== (value.citations.length > 0)) throw new Error('unavailable');
  return value as GuideAnswer;
}

export function parseConfig(input: unknown): GuideConfig {
  const value = unwrapped(input) as Partial<GuideConfig> | null;
  if (!value || typeof value.enabled !== 'boolean' || !Number.isInteger(value.maxQuestionCharacters) ||
      value.maxQuestionCharacters! < 1 || value.maxQuestionCharacters! > 8000 || !Number.isInteger(value.timeoutMs) ||
      value.timeoutMs! < 1000 || value.timeoutMs! > 90000) throw new Error('unavailable');
  return value as GuideConfig;
}

/** Escape every Markdown punctuation character before using Deep Chat's text renderer. */
export function plainChatText(value: string): string {
  return value.replace(/[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/g, '\\$&');
}
