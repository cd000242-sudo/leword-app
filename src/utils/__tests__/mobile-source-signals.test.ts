import {
  buildMobileSourceSignalSnapshot,
  type MobileSourceSignalProviders,
} from '../../mobile/source-signals';
import { MOBILE_SOURCE_ROUTES } from '../../mobile/contracts';

function assert(name: string, condition: unknown, detail = ''): void {
  if (!condition) {
    console.error(`[mobile-source-signals] failed: ${name}${detail ? ` - ${detail}` : ''}`);
    process.exit(1);
  }
}

const fixedNow = new Date('2026-06-06T00:00:00.000Z');

const providers: MobileSourceSignalProviders = {
  realtime: async () => [
    { keyword: '여름 원피스 추천', rank: 1, source: 'naver', timestamp: fixedNow.toISOString(), change: 'up' },
  ],
  policy: async () => [
    {
      keyword: '근로장려금 신청',
      rank: 1,
      title: '근로장려금 정기 신청 안내',
      source: 'policy-briefing',
      timestamp: fixedNow.toISOString(),
      category: '정책브리핑',
    },
  ],
  issues: async () => [
    {
      source: 'starnews',
      sourceLabel: '스타뉴스',
      title: '아이돌 컴백 일정 공식 발표',
      url: 'https://example.test/star',
      category: '연예',
      publishedAt: fixedNow.toISOString(),
      ago: '10분 전',
      minutesAgo: 10,
    },
  ],
};

async function run(): Promise<void> {
  assert('source signal route is stable', MOBILE_SOURCE_ROUTES.signals === '/v1/mobile/source-signals');

  const all = await buildMobileSourceSignalSnapshot({
    lane: 'all',
    limit: 3,
    providers,
    now: fixedNow,
  });
  assert('all lanes are populated',
    all.realtime.length === 1 && all.policy.length === 1 && all.issues.length === 1,
    JSON.stringify({ realtime: all.realtime.length, policy: all.policy.length, issues: all.issues.length }));
  assert('realtime signal maps rank and source',
    all.realtime[0].kind === 'realtime'
      && all.realtime[0].priority === 100
      && all.realtime[0].source === 'naver'
      && all.realtime[0].keyword === '여름 원피스 추천');
  assert('policy signal preserves title and category',
    all.policy[0].kind === 'policy'
      && all.policy[0].title === '근로장려금 정기 신청 안내'
      && all.policy[0].categoryId === 'policy');
  assert('issue signal uses article source label',
    all.issues[0].kind === 'issue'
      && all.issues[0].source === '스타뉴스'
      && /10분 전/.test(all.issues[0].description));

  const policyOnly = await buildMobileSourceSignalSnapshot({
    lane: 'policy',
    limit: 2,
    providers,
    now: fixedNow,
  });
  assert('single lane request only fills that lane',
    policyOnly.policy.length === 1 && policyOnly.realtime.length === 0 && policyOnly.issues.length === 0);

  const fallback = await buildMobileSourceSignalSnapshot({
    lane: 'realtime',
    limit: 2,
    providers: {
      realtime: async () => [],
      policy: providers.policy,
      issues: providers.issues,
    },
    now: fixedNow,
  });
  assert('empty provider falls back to local defaults',
    fallback.fallbackUsed === true && fallback.realtime.length === 2 && fallback.realtime[0].keyword.length > 0);

  const timeoutStart = Date.now();
  const timedOut = await buildMobileSourceSignalSnapshot({
    lane: 'all',
    limit: 5,
    timeoutMs: 25,
    providers: {
      realtime: async () => new Promise<any[]>(() => {}),
      policy: async () => [],
      issues: async () => [],
    },
    now: fixedNow,
  });
  assert('slow providers fall back quickly and still cover ZUM',
    Date.now() - timeoutStart < 1200
      && timedOut.fallbackUsed === true
      && timedOut.realtime.some((item) => item.source === 'ZUM'),
    JSON.stringify({
      elapsedMs: Date.now() - timeoutStart,
      realtime: timedOut.realtime.map((item) => item.source),
    }));

  console.log('[mobile-source-signals] passed');
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
