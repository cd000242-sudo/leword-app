import {
  type MobileSignalItem,
  type MobileSourceSignalLane,
  type MobileSourceSignalSnapshot,
} from './contracts';

type RealtimeSourceItem = {
  keyword?: string;
  text?: string;
  rank?: number;
  source?: string;
  timestamp?: string;
  change?: string;
};

type PolicySourceItem = {
  keyword?: string;
  title?: string;
  rank?: number;
  source?: string;
  timestamp?: string;
  category?: string;
  publishedAt?: string;
  url?: string;
};

type EntertainmentSourceItem = {
  title?: string;
  source?: string;
  sourceLabel?: string;
  category?: string;
  url?: string;
  publishedAt?: string | null;
  ago?: string;
  minutesAgo?: number | null;
};

export interface MobileSourceSignalProviders {
  realtime?: (limit: number) => Promise<RealtimeSourceItem[]>;
  policy?: (limit: number) => Promise<PolicySourceItem[]>;
  issues?: (limit: number) => Promise<EntertainmentSourceItem[]>;
}

interface BuildMobileSourceSignalSnapshotOptions {
  lane?: MobileSourceSignalLane;
  limit?: number;
  providers?: MobileSourceSignalProviders;
  now?: Date;
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 6;
  return Math.max(1, Math.min(30, Math.floor(value as number)));
}

function sourceId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'signal';
}

function createSignal(
  kind: MobileSignalItem['kind'],
  idPrefix: string,
  keyword: string,
  title: string,
  description: string,
  priority: number,
  source: string,
  categoryId: string | undefined,
  createdAt: string,
): MobileSignalItem {
  return {
    id: `${idPrefix}-${sourceId(keyword)}`,
    kind,
    keyword,
    title,
    description,
    source,
    priority,
    categoryId,
    createdAt,
  };
}

function priorityFromRank(rank: unknown, fallback: number): number {
  const numeric = typeof rank === 'number' && Number.isFinite(rank) ? rank : fallback;
  return Math.max(1, 101 - numeric);
}

function realtimeDescription(item: RealtimeSourceItem): string {
  if (item.change === 'up') return '상승 중인 실시간 검색어입니다. 바로 정밀 분석으로 넘겨 검색량과 문서수를 확인하세요.';
  if (item.change === 'new') return '새로 포착된 실시간 검색어입니다. 이슈성 확장 후보로 적합합니다.';
  return '실시간 소스에서 포착된 검색어입니다. PC 엔진으로 경쟁도를 확인하세요.';
}

function mapRealtime(items: RealtimeSourceItem[], limit: number, createdAt: string): MobileSignalItem[] {
  return items
    .map((item, index) => {
      const keyword = String(item.keyword || item.text || '').trim();
      if (!keyword) return null;
      const source = String(item.source || 'realtime');
      return createSignal(
        'realtime',
        `rt-${source}-${item.rank || index + 1}`,
        keyword,
        '실시간 검색어',
        realtimeDescription(item),
        priorityFromRank(item.rank, index + 1),
        source,
        undefined,
        createdAt,
      );
    })
    .filter(Boolean)
    .slice(0, limit) as MobileSignalItem[];
}

function mapPolicy(items: PolicySourceItem[], limit: number, createdAt: string): MobileSignalItem[] {
  return items
    .map((item, index) => {
      const keyword = String(item.keyword || item.title || '').trim();
      if (!keyword) return null;
      const title = String(item.title || keyword).trim();
      const category = item.category ? ` · ${item.category}` : '';
      const published = item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : '';
      return createSignal(
        'policy',
        `policy-${item.rank || index + 1}`,
        keyword,
        title,
        `공식 정책 신호${category}${published}. 신청, 대상, 조건, 지급일 롱테일로 확장하세요.`,
        priorityFromRank(item.rank, index + 1),
        String(item.source || 'policy-briefing'),
        'policy',
        createdAt,
      );
    })
    .filter(Boolean)
    .slice(0, limit) as MobileSignalItem[];
}

function mapIssues(items: EntertainmentSourceItem[], limit: number, createdAt: string): MobileSignalItem[] {
  return items
    .map((item, index) => {
      const keyword = String(item.title || '').trim();
      if (!keyword) return null;
      const source = String(item.sourceLabel || item.source || 'issue-radar');
      const ago = item.ago ? `${item.ago} · ` : '';
      const category = item.category || '이슈';
      return createSignal(
        'issue',
        `issue-${item.source || 'news'}-${index + 1}`,
        keyword,
        category,
        `${ago}${source}에서 포착된 이슈입니다. 공식입장, 일정, 반응, 정리 의도로 확장하세요.`,
        priorityFromRank(index + 1, index + 1),
        source,
        'celebrity',
        createdAt,
      );
    })
    .filter(Boolean)
    .slice(0, limit) as MobileSignalItem[];
}

export function fallbackSourceSignals(now = new Date()): Omit<MobileSourceSignalSnapshot, 'fallbackUsed'> {
  const createdAt = now.toISOString();
  return {
    updatedAt: createdAt,
    realtime: [
      createSignal('realtime', 'rt', '여름 원피스 추천', '여름 쇼핑 수요', '계절성은 높지만 문서수 검증 후 롱테일로 확장하세요.', 95, 'seasonal-watch', 'living', createdAt),
      createSignal('realtime', 'rt', '장마 준비물', '생활형 급상승', '장마, 제습, 침수 예방처럼 실구매 의도가 있는 하위 키워드가 좋습니다.', 88, 'seasonal-watch', 'living', createdAt),
      createSignal('realtime', 'rt', '여름휴가 숙소', '휴가 검색 증가', '지역, 일정, 가격 조건을 붙여 상위노출 가능성을 확인하세요.', 82, 'seasonal-watch', 'travel', createdAt),
    ],
    policy: [
      createSignal('policy', 'policy', '근로장려금 지급일', '정책 브리핑', '신청 기간, 지급일, 대상자 확인으로 글감을 나누면 검색 의도가 명확합니다.', 98, 'policy-briefing', 'policy', createdAt),
      createSignal('policy', 'policy', '청년도약계좌 조건', '정책 브리핑', '조건, 신청, 중도해지, 은행별 비교로 확장하기 좋습니다.', 91, 'policy-briefing', 'policy', createdAt),
      createSignal('policy', 'policy', '에너지바우처 신청', '정책 브리핑', '계절성 지원금은 지역/대상별 롱테일을 우선 확인하세요.', 86, 'policy-briefing', 'policy', createdAt),
    ],
    issues: [
      createSignal('issue', 'issue', '개인정보 유출 확인', '오늘의 이슈', '피해 확인, 보상, 대처 방법처럼 정보성 구조가 잘 맞습니다.', 90, 'issue-radar', 'it', createdAt),
      createSignal('issue', 'issue', '환급금 조회', '생활 이슈', '정부24, 홈택스, 보험 환급처럼 출처별로 쪼개면 좋습니다.', 84, 'issue-radar', 'finance', createdAt),
      createSignal('issue', 'issue', '건강검진 대상자 조회', '반복 수요', '연령, 직장인, 지역 검진기관 키워드로 확장하세요.', 80, 'issue-radar', 'health', createdAt),
    ],
  };
}

async function defaultRealtimeProvider(limit: number): Promise<RealtimeSourceItem[]> {
  const { getNaverRealtimeKeywords } = await import('../utils/realtime-search-keywords');
  return getNaverRealtimeKeywords(limit);
}

async function defaultPolicyProvider(limit: number): Promise<PolicySourceItem[]> {
  const { getPolicyBriefingKeywords } = await import('../utils/policy-briefing-api');
  return getPolicyBriefingKeywords(limit);
}

async function defaultIssueProvider(limit: number): Promise<EntertainmentSourceItem[]> {
  const { fetchEntertainmentAggregate } = await import('../utils/entertainment-news-aggregator');
  return fetchEntertainmentAggregate({
    maxMinutesAgo: 360,
    limitPerSource: Math.min(8, limit),
  });
}

async function collectLane<T>(
  enabled: boolean,
  provider: (limit: number) => Promise<T[]>,
  limit: number,
): Promise<T[]> {
  if (!enabled) return [];
  try {
    return await provider(limit);
  } catch {
    return [];
  }
}

export async function buildMobileSourceSignalSnapshot(
  options: BuildMobileSourceSignalSnapshotOptions = {},
): Promise<MobileSourceSignalSnapshot> {
  const lane = options.lane || 'all';
  const limit = normalizeLimit(options.limit);
  const now = options.now || new Date();
  const createdAt = now.toISOString();
  const providers = options.providers || {};
  const fallback = fallbackSourceSignals(now);

  const [realtimeRaw, policyRaw, issueRaw] = await Promise.all([
    collectLane(lane === 'all' || lane === 'realtime', providers.realtime || defaultRealtimeProvider, limit),
    collectLane(lane === 'all' || lane === 'policy', providers.policy || defaultPolicyProvider, limit),
    collectLane(lane === 'all' || lane === 'issues', providers.issues || defaultIssueProvider, limit),
  ]);

  let fallbackUsed = false;
  let realtime = mapRealtime(realtimeRaw, limit, createdAt);
  let policy = mapPolicy(policyRaw, limit, createdAt);
  let issues = mapIssues(issueRaw, limit, createdAt);

  if ((lane === 'all' || lane === 'realtime') && realtime.length === 0) {
    fallbackUsed = true;
    realtime = fallback.realtime.slice(0, limit);
  }
  if ((lane === 'all' || lane === 'policy') && policy.length === 0) {
    fallbackUsed = true;
    policy = fallback.policy.slice(0, limit);
  }
  if ((lane === 'all' || lane === 'issues') && issues.length === 0) {
    fallbackUsed = true;
    issues = fallback.issues.slice(0, limit);
  }

  return {
    updatedAt: createdAt,
    fallbackUsed,
    realtime,
    policy,
    issues,
  };
}
