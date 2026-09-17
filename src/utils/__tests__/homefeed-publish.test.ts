import { describe, expect, it } from 'vitest';
import { buildHomefeedPublicPayload, resolveSiteDataDir } from '../homefeed/publish';

/**
 * 홈판 신호 공개 발행 — 사이트가 앱 없이도 읽는 정적 JSON(2026-09-17).
 *
 * 사장님: "사이트는 굳이 앱을 안 켜도 보이도록 해 줄래."
 *
 * 지금까지는 사이트가 브리지(127.0.0.1)만 불렀고, 앱이 꺼지면 "앱이 꺼져 있습니다" 안내만 떴다.
 * 다른 보드(황금 · 제휴 · 실검 틈새 · 추천키워드)는 전부 정적 JSON 을 읽어 앱 없이 보인다 — 홈판만 없었다.
 *
 * 모양은 브리지 응답(service.stories)과 같게 둔다. 그래야 사이트가 코드 한 벌로 둘 다 그린다.
 * 다만 내 PC 상태(runtime · settings)는 공개본에서 뺀다 — 남의 화면에 내 수집기 상태가 갈 이유가 없다.
 */

function story(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    issueKey: id,
    keyword: id,
    category: 'sports',
    capturedAt: '2026-09-17T02:00:00.000Z',
    window: { state: 'OPEN', reasons: ['SOURCES_OK'] },
    status: { state: 'NOW', reasons: ['ALL_GATES_PASSED'] },
    anchor: { text: id, category: 'sports' },
    delta: null,
    deltaReason: null,
    signals: { sampleN: 3 },
    tensions: [{ type: 'rival_compare', matched: '상위 호환' }],
    funGap: [{ flag: 'visible_contrast', note: '근거' }],
    alternativeAngles: ['다른 각도'],
    payoffCount: 2,
    noSearchPassed: true,
    tellable: '한 줄',
    firstCard: { headline1: '첫 줄', headline2: null, hook: '압승', possible: true },
    visualStrategy: 'REAL-FIRST',
    thumbnail: { type: 'real', readiness: 'ready', heroImageUrl: 'https://img.example.com/1.jpg' },
    risks: [],
    progress: { titles: true, selected: false, drafts: 1, images: 0 },
    ...overrides,
  };
}

function bridgeResult(stories: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    settings: { enabled: true, snapshotIntervalMinutes: 10, imageProvider: 'none', ai: { title: true } },
    runtime: { running: false, lastRunAt: '2026-09-17T02:13:58.396Z', lastError: null, lastDurationMs: 4210, nextRunAt: '2026-09-17T02:23:58.396Z' },
    computedAt: '2026-09-17T02:14:00.000Z',
    snapshotAt: '2026-09-17T02:13:58.396Z',
    historySnapshots: 42,
    storedSnapshots: 120,
    sources: [{ name: 'signal.bz', lastSuccessAt: '2026-09-17T02:13:58.396Z', lastErrorAt: null, lastError: null, consecutiveFailures: 0, lastCount: 10, skipped: false }],
    counts: { status: { NOW: 1 }, window: { OPEN: 1 } },
    stories,
    ...overrides,
  };
}

describe('공개 발행본 만들기', () => {
  it('스토리 · 원천 · 집계는 그대로 싣는다', () => {
    const payload = buildHomefeedPublicPayload(bridgeResult([story('손흥민')]), null, { nowMs: Date.parse('2026-09-17T02:15:00.000Z') });
    expect(payload).not.toBeNull();
    expect(payload!.stories).toHaveLength(1);
    expect(payload!.stories[0]).toMatchObject({ keyword: '손흥민', firstCard: { hook: '압승' } });
    expect((payload!.sources[0] as { name: string }).name).toBe('signal.bz');
    expect(payload!.counts.status).toEqual({ NOW: 1 });
    expect(payload!.computedAt).toBe('2026-09-17T02:14:00.000Z');
  });

  it('내 PC 상태(runtime · settings)는 공개본에 넣지 않는다', () => {
    const payload = buildHomefeedPublicPayload(bridgeResult([story('손흥민')]), null, { nowMs: Date.now() });
    expect(payload).not.toBeNull();
    expect(payload as unknown as Record<string, unknown>).not.toHaveProperty('runtime');
    expect(payload as unknown as Record<string, unknown>).not.toHaveProperty('settings');
  });

  it('발행 시각과 스키마 버전을 적는다 — 사이트가 얼마나 묵은 것인지 안다', () => {
    const payload = buildHomefeedPublicPayload(bridgeResult([story('손흥민')]), null, { nowMs: Date.parse('2026-09-17T02:15:00.000Z') });
    expect(payload!.publishedAt).toBe('2026-09-17T02:15:00.000Z');
    expect(payload!.schemaVersion).toBe('homefeed-public-v1');
  });

  it('스토리가 0 이면 기존 파일을 덮지 않는다 — null 을 돌려준다', () => {
    expect(buildHomefeedPublicPayload(bridgeResult([]), null, { nowMs: Date.now() })).toBeNull();
  });

  it('스토리가 0 이어도 직전 발행본이 없으면 그냥 안 만든다', () => {
    const prev = { schemaVersion: 'homefeed-public-v1', publishedAt: '2026-09-17T01:00:00.000Z', stories: [story('옛것')] } as never;
    expect(buildHomefeedPublicPayload(bridgeResult([]), prev, { nowMs: Date.now() })).toBeNull();
  });

  it('모양이 아니면 만들지 않는다 — 앱 응답도 바깥 입력으로 본다', () => {
    expect(buildHomefeedPublicPayload(null, null, { nowMs: Date.now() })).toBeNull();
    expect(buildHomefeedPublicPayload({ stories: '목록 아님' } as never, null, { nowMs: Date.now() })).toBeNull();
  });
});

describe('사이트 폴더 찾기', () => {
  it('설정 경로에 spa/public/data 가 있으면 그것을 쓴다', () => {
    const path = require('path') as typeof import('path');
    const target = path.join('내사이트', 'spa', 'public', 'data');
    const exists = (p: string) => p === target;
    expect(resolveSiteDataDir({ configured: '내사이트', home: '/home', exists })).toBe(target);
  });

  it('설정이 비면 바탕화면 · 문서에서 사이트 폴더를 찾는다', () => {
    const path = require('path') as typeof import('path');
    const target = path.join('/home', 'Desktop', '리더 네이버 자동화', 'spa', 'public', 'data');
    const exists = (p: string) => p === target;
    expect(resolveSiteDataDir({ configured: '', home: '/home', exists })).toBe(target);
  });

  it('설정 경로가 틀리면 자동 찾기로 넘어간다 — 조용히 실패하지 않는다', () => {
    const path = require('path') as typeof import('path');
    const target = path.join('/home', 'Documents', '리더 네이버 자동화', 'spa', 'public', 'data');
    const exists = (p: string) => p === target;
    expect(resolveSiteDataDir({ configured: '없는경로', home: '/home', exists })).toBe(target);
  });

  it('아무 데도 없으면 null — 발행을 건너뛰고 회차는 산다', () => {
    expect(resolveSiteDataDir({ configured: '', home: '/home', exists: () => false })).toBeNull();
  });
});
