/** Public, source-linked writing material. Readiness is assigned only after independent review. */
export interface BriefWritingPackage {
  version: 1;
  status: 'ready' | 'needs_research';
  title: string;
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[]; factIds: string[] }>;
  table: { caption: string; headers: string[]; rows: string[][]; factIds: string[] } | null;
  faq: Array<{ question: string; answer: string; factIds: string[] }>;
  conclusion: string;
  nextSteps: string[];
  missing: string[];
  sourceIds: string[];
  reviewedAt: string;
}
export interface WritingSource { id: string; link: string }
type Value = Record<string, unknown>;
const object = (value: unknown): Value | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : null;
const string = (value: unknown, min = 1, max = 2000): string | null => {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result.length >= min && result.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result) ? result : null;
};
const list = (value: unknown, min: number, max: number): unknown[] | null => Array.isArray(value) && value.length >= min && value.length <= max ? value : null;
function strings(value: unknown, min: number, max: number, minLength = 1, maxLength = 2000): string[] | null {
  const rows = list(value, min, max);
  if (!rows) return null;
  const result = rows.map(row => string(row, minLength, maxLength));
  return result.every((row): row is string => row !== null) ? result : null;
}
export function safeWritingSourceUrl(value: unknown): boolean {
  try {
    const url = new URL(typeof value === 'string' ? value : '');
    return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
function ids(value: unknown, allowed: Set<string>): string[] | null {
  const result = strings(value, 1, 20, 1, 120);
  return result && new Set(result).size === result.length && result.every(id => allowed.has(id)) ? result : null;
}
const personalExperience = /(?:제가|저는|내가|나는)\s|직접\s*(?:방문해\s*보니|사용해\s*보니|써\s*보니|받아\s*보니|경험했)|(?:써봤|방문했더니|받았더니)/;

/** Strict structural checks; semantic truth and title completeness require the separate reviewer. */
export function validateBriefWritingDraft(value: unknown, sources: readonly WritingSource[]): BriefWritingPackage | null {
  const draft = object(value);
  if (!draft || draft.version !== 1 || !Array.isArray(draft.missing) || draft.missing.length) return null;
  const allowed = new Set(sources.filter(source => safeWritingSourceUrl(source.link)).map(source => source.id));
  const sourceIds = ids(draft.sourceIds, allowed);
  if (!sourceIds) return null;
  const usedSources = new Set(sourceIds);
  const title = string(draft.title, 4, 180), intro = string(draft.intro, 20, 1500), conclusion = string(draft.conclusion, 20, 1500);
  const nextSteps = strings(draft.nextSteps, 1, 8, 5, 600);
  const rawSections = list(draft.sections, 2, 8), rawFaq = list(draft.faq, 1, 6);
  if (!title || !intro || !conclusion || !nextSteps || !rawSections || !rawFaq) return null;
  const sections: BriefWritingPackage['sections'] = [];
  for (const raw of rawSections) {
    const section = object(raw); if (!section) return null;
    const heading = string(section.heading, 2, 180), paragraphs = strings(section.paragraphs, 1, 5, 20, 2000), factIds = ids(section.factIds, usedSources);
    if (!heading || !paragraphs || !factIds) return null;
    sections.push({ heading, paragraphs, factIds });
  }
  const faq: BriefWritingPackage['faq'] = [];
  for (const raw of rawFaq) {
    const item = object(raw); if (!item) return null;
    const question = string(item.question, 4, 200), answer = string(item.answer, 15, 1000), factIds = ids(item.factIds, usedSources);
    if (!question || !answer || !factIds) return null;
    faq.push({ question, answer, factIds });
  }
  let table: BriefWritingPackage['table'] = null;
  if (draft.table !== null) {
    const raw = object(draft.table); if (!raw) return null;
    const caption = string(raw.caption, 2, 180), headers = strings(raw.headers, 2, 6, 1, 150), factIds = ids(raw.factIds, usedSources);
    const rows = list(raw.rows, 1, 15);
    if (!caption || !headers || !factIds || !rows) return null;
    const cleanRows = rows.map(row => strings(row, headers.length, headers.length, 1, 600));
    if (!cleanRows.every((row): row is string[] => row !== null)) return null;
    table = { caption, headers, rows: cleanRows, factIds };
  }
  const result: BriefWritingPackage = { version: 1, status: 'needs_research', title, intro, sections, table, faq, conclusion, nextSteps, missing: [], sourceIds, reviewedAt: '' };
  const contents = [title, intro, conclusion, ...sections.flatMap(section => [section.heading, ...section.paragraphs]), ...faq.flatMap(item => [item.question, item.answer]), ...(table ? [table.caption, ...table.headers, ...table.rows.flat()] : [])];
  if (contents.some(content => personalExperience.test(content) || /(?:\.{3}|…)\s*$/.test(content))) return null;
  const referenced = new Set([...sections.flatMap(section => section.factIds), ...faq.flatMap(item => item.factIds), ...(table?.factIds || [])]);
  return sourceIds.every(id => referenced.has(id)) ? result : null;
}
