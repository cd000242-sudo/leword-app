/**
 * 홈판 신호 테스트용 조립 도구 — 시각은 전부 절대값을 넘기고 벽시계(Date.now)를 쓰지 않는다(픽스처 달력 부패 방지).
 */
import { HOMEFEED_SCHEMA, type HomefeedIssueSnapshot, type HomefeedSample, type HomefeedSignalState, type HomefeedSnapshot } from '../homefeed/types';
import { normalizeHomefeedSettings, type HomefeedSettings } from '../homefeed/settings';
import { compactKey } from '../homefeed/text';

export const T0 = Date.parse('2026-09-16T00:00:00.000Z');
export const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

export function sample(title: string, overrides: Partial<HomefeedSample> = {}): HomefeedSample {
  return {
    title,
    url: `https://news.example.com/${encodeURIComponent(title)}`,
    press: 'news.example.com',
    publishedAt: at(0),
    image: null,
    origin: 'naver-news',
    ...overrides,
  };
}

export function issue(keyword: string, overrides: Partial<HomefeedIssueSnapshot> = {}): HomefeedIssueSnapshot {
  return {
    issueKey: compactKey(keyword),
    keyword,
    category: 'unknown',
    ranks: { 'signal.bz': 1 },
    newsTotal: 100,
    blogDocCount: 1000,
    samples: [],
    boardWhy: null,
    ...overrides,
  };
}

export function snapshot(capturedAt: string, issues: HomefeedIssueSnapshot[], overrides: Partial<HomefeedSnapshot> = {}): HomefeedSnapshot {
  return {
    schemaVersion: HOMEFEED_SCHEMA.snapshot,
    capturedAt,
    collectorVersion: 'test',
    intervalMinutes: 10,
    sources: [{ name: 'signal.bz', ok: true, count: issues.length, error: null }],
    issues,
    ...overrides,
  };
}

export function ledger(entries: Array<{ keyword: string; firstSeenAt: string; censored?: boolean }>): HomefeedSignalState {
  return {
    schemaVersion: HOMEFEED_SCHEMA.signalState,
    updatedAt: null,
    entries: Object.fromEntries(entries.map((row) => [compactKey(row.keyword), {
      issueKey: compactKey(row.keyword),
      keyword: row.keyword,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.firstSeenAt,
      firstSeenCensored: row.censored ?? false,
      appearances: 1,
    }])),
  };
}

export function settings(patch: Record<string, unknown> = {}): HomefeedSettings {
  return normalizeHomefeedSettings(patch);
}
