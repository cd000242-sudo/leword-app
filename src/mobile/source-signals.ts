import {
  type MobileSignalItem,
  type MobileSourceSignalLane,
  type MobileSourceSignalSnapshot,
} from './contracts';

type RealtimeSourceName = 'naver' | 'daum' | 'nate' | 'google' | 'zum' | 'bokjiro' | 'policy' | 'youtube';

type RealtimeSourceItem = {
  keyword?: string;
  text?: string;
  rank?: number;
  source?: RealtimeSourceName | string;
  timestamp?: string;
  change?: string;
  strengthScore?: number;
  strengthGrade?: string;
  sourceCount?: number;
  matchedSources?: RealtimeSourceName[];
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

const REALTIME_SOURCE_ORDER: RealtimeSourceName[] = ['naver', 'daum', 'nate', 'google', 'zum', 'bokjiro'];
const REQUIRED_PUBLIC_REALTIME_LABELS = ['네이버', '다음', '네이트', 'Google'];

const SOURCE_LABEL: Record<string, string> = {
  naver: '네이버',
  daum: '다음',
  nate: '네이트',
  google: 'Google',
  zum: 'ZUM',
  bokjiro: '정책',
  policy: '정책',
  youtube: 'YouTube',
  'policy-briefing': '정책브리핑',
};

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

function keywordKey(input: string): string {
  return String(input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[“”‘’"'`]/g, '')
    .replace(/[()\[\]{}<>|·ㆍ:：,./\\!?！？_-]/g, ' ')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function sourceLabel(source: string | undefined): string {
  const normalized = String(source || '').toLowerCase();
  return SOURCE_LABEL[normalized] || source || 'source';
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
  const source = sourceLabel(String(item.source || 'realtime'));
  const sources = item.matchedSources?.length
    ? `${item.matchedSources.map(sourceLabel).join(', ')} 교차 포착`
    : `${source} 포착`;
  if (item.change === 'up') {
    return `${sources}. 상승 중인 실시간 검색어입니다. 바로 정밀 분석으로 넘겨 검색량과 문서수를 확인하세요.`;
  }
  if (item.change === 'new') {
    return `${sources}. 새로 진입한 이슈라 빠른 선점 후보로 검토할 수 있습니다.`;
  }
  if ((item.sourceCount || 0) >= 2) {
    return `${sources}. 여러 소스에서 겹친 흐름이라 황금키워드 후보로 우선 확인합니다.`;
  }
  return `${sources}. 빅키워드는 하위 의도로 쪼개서 Pro 엔진에서 검증합니다.`;
}

function mapRealtime(items: RealtimeSourceItem[], limit: number, createdAt: string): MobileSignalItem[] {
  return items
    .map((item, index) => {
      const keyword = String(item.keyword || item.text || '').trim();
      if (!keyword) return null;
      const source = String(item.source || 'realtime');
      const label = sourceLabel(source);
      return createSignal(
        'realtime',
        `rt-${source}-${item.rank || index + 1}`,
        keyword,
        `${label} 실시간`,
        realtimeDescription(item),
        Math.max(priorityFromRank(item.rank, index + 1), Math.round(item.strengthScore || 0)),
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
        sourceLabel(item.source || 'policy-briefing'),
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
        `${ago}${source}에서 포착한 이슈입니다. 공식입장, 일정, 반응, 정리 의도로 확장하세요.`,
        priorityFromRank(index + 1, index + 1),
        source,
        'celebrity',
        createdAt,
      );
    })
    .filter(Boolean)
    .slice(0, limit) as MobileSignalItem[];
}

function signalMatchesSource(item: MobileSignalItem, label: string): boolean {
  return item.source === label || item.title.includes(label);
}

function ensureRealtimeSourceCoverage(
  items: MobileSignalItem[],
  fallback: MobileSignalItem[],
  limit: number,
): MobileSignalItem[] {
  const chosen: MobileSignalItem[] = [];
  const usedIds = new Set<string>();
  const push = (item: MobileSignalItem | undefined) => {
    if (!item || usedIds.has(item.id)) return;
    chosen.push(item);
    usedIds.add(item.id);
  };

  for (const label of REQUIRED_PUBLIC_REALTIME_LABELS) {
    push(items.find((item) => signalMatchesSource(item, label))
      || fallback.find((item) => signalMatchesSource(item, label)));
  }

  for (const item of items.sort((a, b) => b.priority - a.priority)) {
    if (chosen.length >= limit) break;
    push(item);
  }

  for (const item of fallback) {
    if (chosen.length >= limit) break;
    push(item);
  }

  return chosen.slice(0, limit);
}

export function fallbackSourceSignals(now = new Date()): Omit<MobileSourceSignalSnapshot, 'fallbackUsed'> {
  const createdAt = now.toISOString();
  return {
    updatedAt: createdAt,
    realtime: [
      createSignal('realtime', 'rt', '여름 원피스 추천', '네이버 실시간', '계절 수요가 높습니다. 추천, 코디, 사이즈, 브랜드 비교형으로 쪼개서 검증하세요.', 95, '네이버', 'shopping', createdAt),
      createSignal('realtime', 'rt', '장마 준비물', '다음 실시간', '장마, 제습, 침수 예방처럼 구매와 생활 정보가 붙는 하위 키워드가 좋습니다.', 88, '다음', 'living', createdAt),
      createSignal('realtime', 'rt', '오늘 방송 출연진', '네이트 이슈', '방송 직후 회차, 재방송, 출연진, 결말 키워드로 빠르게 선점합니다.', 84, '네이트', 'broadcast', createdAt),
      createSignal('realtime', 'rt', '여름휴가 숙소', 'Google Trends', '지역, 일정, 가격 조건을 붙이면 작성 가능한 키워드로 바뀝니다.', 82, 'Google', 'travel', createdAt),
    ],
    policy: [
      createSignal('policy', 'policy', '근로장려금 지급일', '정책브리핑', '신청기간, 지급일, 대상자 확인으로 글감을 나누면 검색 의도가 명확합니다.', 98, '정책브리핑', 'policy', createdAt),
      createSignal('policy', 'policy', '청년 월세 지원 조건', '정책브리핑', '조건, 신청, 중도해지, 지역 비교형으로 확장하기 좋습니다.', 91, '정책브리핑', 'policy', createdAt),
      createSignal('policy', 'policy', '에너지바우처 신청', '정책브리핑', '계절성 지원금과 신청 대상 롱테일을 우선 확인하세요.', 86, '정책브리핑', 'policy', createdAt),
    ],
    issues: [
      createSignal('issue', 'issue', '신작 드라마 출연진', '방송 이슈', '몇부작, 원작, 인물관계도, 결말예상으로 바로 확장 가능합니다.', 90, '연예 이슈', 'broadcast', createdAt),
      createSignal('issue', 'issue', '대표팀 경기 일정', '스포츠 이슈', '중계, 명단, 하이라이트, 결과 키워드로 빠르게 선점하세요.', 84, '스포츠 이슈', 'sports', createdAt),
      createSignal('issue', 'issue', '건강검진 대상자 조회', '생활 이슈', '연령, 직장인, 병원, 예약 방법으로 확장하세요.', 80, '생활 이슈', 'health', createdAt),
    ],
  };
}

function mergeRealtimeGroups(groups: Partial<Record<RealtimeSourceName, RealtimeSourceItem[]>>, limit: number): RealtimeSourceItem[] {
  const selected: RealtimeSourceItem[] = [];
  const seen = new Set<string>();

  for (const source of REALTIME_SOURCE_ORDER) {
    const first = (groups[source] || [])[0];
    const keyword = String(first?.keyword || first?.text || '').trim();
    const key = keywordKey(keyword);
    if (first && key && !seen.has(key)) {
      selected.push({ ...first, source: first.source || source });
      seen.add(key);
    }
  }

  const rest = REALTIME_SOURCE_ORDER
    .flatMap((source) => (groups[source] || []).slice(1).map((item) => ({ ...item, source: item.source || source })))
    .sort((a, b) => {
      const strengthDiff = (Number(b.strengthScore) || 0) - (Number(a.strengthScore) || 0);
      if (strengthDiff !== 0) return strengthDiff;
      const sourceDiff = (Number(b.sourceCount) || 0) - (Number(a.sourceCount) || 0);
      if (sourceDiff !== 0) return sourceDiff;
      return (Number(a.rank) || 999) - (Number(b.rank) || 999);
    });

  for (const item of rest) {
    if (selected.length >= limit) break;
    const keyword = String(item.keyword || item.text || '').trim();
    const key = keywordKey(keyword);
    if (!key || seen.has(key)) continue;
    selected.push(item);
    seen.add(key);
  }

  return selected.slice(0, limit);
}

async function defaultRealtimeProvider(limit: number): Promise<RealtimeSourceItem[]> {
  const { getAllRealtimeKeywords } = await import('../utils/realtime-search-keywords');
  const perSourceLimit = Math.max(3, Math.ceil(limit / 2));
  const groups = await getAllRealtimeKeywords(perSourceLimit);
  return mergeRealtimeGroups(groups, limit);
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
  const hasCustomRealtimeProvider = typeof providers.realtime === 'function';
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
  } else if ((lane === 'all' || lane === 'realtime') && !hasCustomRealtimeProvider) {
    realtime = ensureRealtimeSourceCoverage(realtime, fallback.realtime, limit);
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
