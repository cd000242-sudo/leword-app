/**
 * 네이버 모바일 홈 'NOW 숏텐츠' 파서(2026-10-29).
 *
 * m.naver.com HTML 안 홈피드 JSON 에 `"code":"searchShortentsNow"` 블록이 있다. 정규식 대신 따옴표·이스케이프 상태를 따라가며
 * 중괄호 짝으로 블록 끝을 잘라 JSON.parse 한다(문자열 안의 중괄호에 속지 않게). 순수 함수 — 네트워크는 부르는 쪽이 한다.
 */

export interface ShortentsItem {
  rank: number;
  keyword: string;
  category: string;
  isNew: boolean;
  summary: string;
  title: string;
  channel: string;
  articleUrl: string;
  searchUrl: string;
}

export interface ShortentsWindow {
  publishTime: string;
  periodStart: string;
  periodEnd: string;
  items: ShortentsItem[];
}

const MARKER = '"code":"searchShortentsNow"';
const MAX_ITEMS = 50;
const LIMITS = { keyword: 120, category: 30, summary: 300, title: 300, channel: 60, url: 600, time: 40 } as const;

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** https?://(*.)naver.com 만 통과 — 호스트 끝이 정확히 naver.com 이어야 한다. */
function naverUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > LIMITS.url) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    const host = url.hostname.toLowerCase();
    return host === 'naver.com' || host.endsWith('.naver.com') ? raw : '';
  } catch {
    return '';
  }
}

function sliceBlock(html: string): string | null {
  const marker = html.indexOf(MARKER);
  if (marker < 0) return null;
  const start = html.lastIndexOf('{"id"', marker);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

export function parseShortentsHtml(html: string): ShortentsWindow | null {
  if (typeof html !== 'string' || !html) return null;
  const block = sliceBlock(html);
  if (!block) return null;
  let contents: any;
  try {
    contents = JSON.parse(block)?.contents;
  } catch {
    return null;
  }
  const publishTime = text(contents?.publishTime, LIMITS.time);
  if (!publishTime || !Array.isArray(contents?.items)) return null;
  const items: ShortentsItem[] = [];
  for (const raw of contents.items.slice(0, MAX_ITEMS)) {
    const keyword = text(raw?.airsKeyword, LIMITS.keyword);
    if (!keyword) continue;
    items.push({
      rank: items.length + 1,
      keyword,
      category: text(raw?.category, LIMITS.category),
      isNew: String(raw?.isNew) === '1',
      summary: text(raw?.topicSummary, LIMITS.summary),
      title: text(raw?.title, LIMITS.title),
      channel: text(raw?.channelName, LIMITS.channel),
      articleUrl: naverUrl(raw?.endUrl),
      searchUrl: naverUrl(raw?.url),
    });
  }
  if (!items.length) return null;
  return {
    publishTime,
    periodStart: text(contents.periodStart, LIMITS.time),
    periodEnd: text(contents.periodEnd, LIMITS.time),
    items,
  };
}
