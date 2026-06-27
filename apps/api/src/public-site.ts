import type {
  MobileLiveGoldenBoardItem,
  MobileLiveGoldenFreshness,
  MobileLiveGoldenRadarSnapshot,
  MobilePublishDecision,
  MobileSignalItem,
  MobileSourceSignalSnapshot,
} from '../../../src/mobile/contracts';
import { renderLewordProWeb } from './pro-web-site';

type PublicPreviewPolicy = 'lower-five' | 'building-board';

export interface PublicLiveGoldenPreviewItem {
  id: string;
  rank: number;
  keyword: string;
  grade: string;
  freshness: MobileLiveGoldenFreshness;
  isMeasured: boolean;
  publicSearchVolumeLabel: string;
  publicDocumentCountLabel: string;
  publicReason: string;
  discoveredAt: string;
  updatedAt: string;
  publishDecision?: MobilePublishDecision;
}

export interface PublicLiveGoldenPayload {
  ok: true;
  updatedAt: string;
  boardTarget: number;
  boardCount: number;
  lockedCount: number;
  publicPreviewCount: number;
  running: boolean;
  exactMetricsLocked: true;
  measurementSourceLabel: string;
  previewPolicy: PublicPreviewPolicy;
  previewPolicyLabel: string;
  statusMessage?: string;
  publicPreview: PublicLiveGoldenPreviewItem[];
}

function redactPublicPreviewItem(item: MobileLiveGoldenBoardItem): PublicLiveGoldenPreviewItem {
  return {
    id: item.id,
    rank: item.rank,
    keyword: item.keyword,
    grade: item.grade,
    freshness: item.freshness,
    isMeasured: item.isMeasured,
    publicSearchVolumeLabel: item.publicSearchVolumeLabel,
    publicDocumentCountLabel: item.publicDocumentCountLabel,
    publicReason: item.publicReason,
    discoveredAt: item.discoveredAt,
    updatedAt: item.updatedAt,
    publishDecision: item.publishDecision,
  };
}

export function buildPublicLiveGoldenPayload(snapshot: MobileLiveGoldenRadarSnapshot | null): PublicLiveGoldenPayload {
  const publicPreview = snapshot?.publicPreview || [];
  const boardTarget = snapshot?.boardTarget || 120;
  const boardCount = snapshot?.boardCount || 0;
  const previewPolicy: PublicPreviewPolicy = boardCount > publicPreview.length ? 'lower-five' : 'building-board';
  return {
    ok: true,
    updatedAt: snapshot?.boardUpdatedAt || snapshot?.lastFinishedAt || new Date().toISOString(),
    boardTarget,
    boardCount,
    lockedCount: Math.max(0, boardCount - publicPreview.length),
    publicPreviewCount: publicPreview.length,
    running: Boolean(snapshot?.running),
    exactMetricsLocked: true,
    measurementSourceLabel: 'Naver SearchAd + Naver Blog Search',
    previewPolicy,
    previewPolicyLabel: previewPolicy === 'lower-five'
      ? '하위 5개 공개'
      : '초기 보드 빌드업 중',
    statusMessage: snapshot?.lastError
      ? '최근 회차에서 일부 소스 연결이 지연되었습니다.'
      : snapshot?.lastMessage,
    publicPreview: publicPreview.map(redactPublicPreviewItem),
  };
}

function makeSignal(
  kind: MobileSignalItem['kind'],
  id: string,
  keyword: string,
  title: string,
  description: string,
  priority: number,
  source: string,
  categoryId?: string,
): MobileSignalItem {
  return {
    kind,
    id,
    keyword,
    title,
    description,
    priority,
    source,
    categoryId,
    createdAt: new Date().toISOString(),
  };
}

function cleanFallbackSignals(): MobileSourceSignalSnapshot {
  const updatedAt = new Date().toISOString();
  return {
    updatedAt,
    fallbackUsed: true,
    realtime: [
      makeSignal('realtime', 'rt-naver-season', '여름 원피스 추천', '네이버/시즌 수요', '계절 수요가 살아나는 검색어입니다. Pro에서는 정확 검색량, 문서수, 확장 후보까지 검증합니다.', 96, 'naver', 'shopping'),
      makeSignal('realtime', 'rt-daum-rain', '장마 준비물', '다음 생활 이슈', '날씨와 생활 검색이 붙는 흐름입니다. 구매형, 비교형, 준비물형으로 빠르게 확장할 수 있습니다.', 91, 'daum', 'living'),
      makeSignal('realtime', 'rt-google-trend', '여름휴가 숙소', 'Google Trends', '지역명, 가격, 예약 시점으로 쪼개면 초보자도 바로 작성 가능한 후보가 됩니다.', 87, 'google', 'travel'),
      makeSignal('realtime', 'rt-nate-issue', '오늘 방송 출연진', '네이트 이슈', '방송 직후 선점하기 좋은 흐름입니다. 회차, 재방송, 출연진, 결말 키워드로 확장합니다.', 84, 'nate', 'broadcast'),
    ],
    policy: [
      makeSignal('policy', 'policy-support', '소상공인 지원금 신청', '정책브리핑', '신청기간, 대상자, 지급일처럼 검색 의도가 분명한 하위 키워드로 확장합니다.', 98, 'policy-briefing', 'policy'),
      makeSignal('policy', 'policy-youth', '청년 월세 지원 조건', '정책브리핑', '조건, 서류, 지자체 비교형 글감으로 바로 전환하기 좋은 정책 후보입니다.', 92, 'policy-briefing', 'policy'),
      makeSignal('policy', 'policy-energy', '에너지바우처 신청', '정책브리핑', '대상자와 신청 절차가 붙어 검색 전환 가능성이 높은 정책 키워드입니다.', 88, 'policy-briefing', 'policy'),
    ],
    issues: [
      makeSignal('issue', 'issue-drama', '신작 드라마 출연진', '방송 이슈', '인물, 원작, 몇부작, 결말예상처럼 빠르게 선점 가능한 방송 흐름입니다.', 94, 'entertainment-radar', 'entertainment'),
      makeSignal('issue', 'issue-sports', '대표팀 경기 일정', '스포츠 이슈', '일정, 중계, 명단, 하이라이트 의도가 붙는 빠른 선점 후보입니다.', 89, 'sports-radar', 'sports'),
      makeSignal('issue', 'issue-star', '스타 근황', '스타/연예 이슈', '방송 출연, 공식입장, 작품 정보로 이어지는 스타/연예 흐름입니다.', 84, 'entertainment-radar', 'entertainment'),
    ],
  };
}

function looksCorrupt(text: string): boolean {
  const markers = ['�', '占', '媛', '꾨', 'ㅼ', '댁', '좎', '쒕', '곗', '⑷', '留', '怨꾩', '臾몄', '濡깊'];
  return markers.some((marker) => text.includes(marker))
    || (text.match(/\?/g)?.length || 0) >= 3;
}

function cleanLane(items: MobileSignalItem[], fallback: MobileSignalItem[]): MobileSignalItem[] {
  if (items.length === 0) return fallback;
  const corruptCount = items.filter((item) => looksCorrupt(`${item.keyword} ${item.title} ${item.description}`)).length;
  return corruptCount >= Math.ceil(items.length / 2) ? fallback : items;
}

export function cleanPublicSourceSignals(snapshot: MobileSourceSignalSnapshot): MobileSourceSignalSnapshot {
  const fallback = cleanFallbackSignals();
  return {
    ...snapshot,
    realtime: cleanLane(snapshot.realtime, fallback.realtime),
    policy: cleanLane(snapshot.policy, fallback.policy),
    issues: cleanLane(snapshot.issues, fallback.issues),
  };
}

const PUBLIC_SOURCE_LANE_LIMIT = 10;

type PublicSourceLaneId = 'naver' | 'daum' | 'nate' | 'zum' | 'policy' | 'issue';

export interface PublicSourceSignalLane {
  id: PublicSourceLaneId;
  label: string;
  description: string;
  items: MobileSignalItem[];
}

export interface PublicSourceSignalPayload {
  ok: true;
  updatedAt: string;
  fallbackUsed: boolean;
  lanes: PublicSourceSignalLane[];
  snapshot: MobileSourceSignalSnapshot;
}

function signalText(item: MobileSignalItem): string {
  return `${item.source || ''} ${item.title || ''} ${item.keyword || ''}`.toLowerCase();
}

function signalMatches(item: MobileSignalItem, tokens: string[]): boolean {
  const text = signalText(item);
  return tokens.some((token) => text.includes(token));
}

interface PublicLaneFallbackSeed {
  kind?: MobileSignalItem['kind'];
  keyword: string;
  title: string;
  description: string;
  priority: number;
  source?: string;
  categoryId?: string;
}

const PUBLIC_SOURCE_LANE_FALLBACKS: Record<PublicSourceLaneId, PublicLaneFallbackSeed[]> = {
  naver: [
    { keyword: '여름 가전 추천', title: '네이버 생활 수요', description: '계절형 구매 검색이 빠르게 올라오는 흐름입니다.', priority: 96, categoryId: 'shopping' },
    { keyword: '장마 대비 준비물', title: '네이버 생활 포착', description: '날씨와 준비물 의도가 함께 붙는 키워드입니다.', priority: 94, categoryId: 'living' },
    { keyword: '에어컨 전기세 절약', title: '네이버 절약 관심', description: '비용 절감형 검색 의도가 강한 생활 키워드입니다.', priority: 92, categoryId: 'living' },
    { keyword: '제습기 추천', title: '네이버 쇼핑 수요', description: '비교, 후기, 가격형 확장이 쉬운 후보입니다.', priority: 90, categoryId: 'shopping' },
    { keyword: '선크림 추천', title: '네이버 시즌 키워드', description: '제품 비교와 피부 타입별 글감으로 확장됩니다.', priority: 88, categoryId: 'beauty' },
    { keyword: '레인부츠 코디', title: '네이버 패션 수요', description: '시즌 패션과 구매 전환 의도가 겹치는 흐름입니다.', priority: 86, categoryId: 'fashion' },
    { keyword: '여름휴가 숙소', title: '네이버 여행 수요', description: '지역명, 가격, 예약 팁으로 쪼개기 좋습니다.', priority: 84, categoryId: 'travel' },
    { keyword: '다이어트 식단', title: '네이버 건강 관심', description: '식단표, 도시락, 후기형으로 넓어지는 키워드입니다.', priority: 82, categoryId: 'health' },
    { keyword: '청년 지원금 신청', title: '네이버 정책 관심', description: '조건, 대상, 신청기간 검색 의도가 분명합니다.', priority: 80, categoryId: 'policy' },
    { keyword: '오늘 날씨', title: '네이버 실시간 수요', description: '지역별 생활 검색으로 확장 가능한 흐름입니다.', priority: 78, categoryId: 'weather' },
  ],
  daum: [
    { keyword: '장마 준비물', title: '다음 생활 이슈', description: '날씨 이슈와 구매형 검색이 같이 붙는 흐름입니다.', priority: 95, categoryId: 'living' },
    { keyword: '주말 영화 추천', title: '다음 문화 관심', description: 'OTT, 개봉작, 평점형 글감으로 확장됩니다.', priority: 93, categoryId: 'entertainment' },
    { keyword: '근로장려금 지급일', title: '다음 정책 검색', description: '일정, 조건, 조회 의도가 또렷한 후보입니다.', priority: 91, categoryId: 'policy' },
    { keyword: '전기요금 조회', title: '다음 생활 정보', description: '조회 방법과 절약 팁으로 전환하기 좋습니다.', priority: 89, categoryId: 'living' },
    { keyword: '여름휴가 국내여행', title: '다음 여행 흐름', description: '지역 추천과 숙소 비교형으로 이어집니다.', priority: 87, categoryId: 'travel' },
    { keyword: '모바일 운전면허증', title: '다음 행정 관심', description: '발급, 등록, 사용처 검색이 붙는 키워드입니다.', priority: 85, categoryId: 'policy' },
    { keyword: '자동차세 납부', title: '다음 생활 세금', description: '납부기간, 조회, 카드 혜택형으로 확장됩니다.', priority: 83, categoryId: 'finance' },
    { keyword: '건강검진 대상자 조회', title: '다음 건강 정보', description: '대상, 예약, 결과 조회 검색 의도가 뚜렷합니다.', priority: 81, categoryId: 'health' },
    { keyword: '해외여행 준비물', title: '다음 여행 체크', description: '체크리스트와 국가별 준비물로 나누기 좋습니다.', priority: 79, categoryId: 'travel' },
    { keyword: '반려동물 등록', title: '다음 생활 정책', description: '등록 방법, 과태료, 변경 신고 의도가 붙습니다.', priority: 77, categoryId: 'living' },
  ],
  nate: [
    { keyword: '오늘 방송 출연진', title: '네이트 방송 이슈', description: '방송 직후 출연진과 재방송 검색이 올라옵니다.', priority: 95, categoryId: 'broadcast' },
    { keyword: '신작 드라마 출연진', title: '네이트 드라마 이슈', description: '인물, 원작, 몇부작으로 빠르게 확장됩니다.', priority: 93, categoryId: 'entertainment' },
    { keyword: '예능 재방송 시간', title: '네이트 방송 관심', description: '회차, 다시보기, 편성표 의도가 붙습니다.', priority: 91, categoryId: 'broadcast' },
    { keyword: '스타 공식입장', title: '네이트 연예 이슈', description: '인물명과 사건 키워드가 함께 움직입니다.', priority: 89, categoryId: 'entertainment' },
    { keyword: '스포츠 중계 일정', title: '네이트 스포츠 흐름', description: '중계 채널, 라인업, 하이라이트 검색으로 이어집니다.', priority: 87, categoryId: 'sports' },
    { keyword: '프로야구 순위', title: '네이트 스포츠 관심', description: '경기 결과와 팀별 일정으로 확장됩니다.', priority: 85, categoryId: 'sports' },
    { keyword: '축구 국가대표 명단', title: '네이트 스포츠 이슈', description: '선수명, 경기일정, 중계 정보가 함께 붙습니다.', priority: 83, categoryId: 'sports' },
    { keyword: '연예인 근황', title: '네이트 스타 검색', description: '방송 출연과 작품 정보로 이어지는 후보입니다.', priority: 81, categoryId: 'entertainment' },
    { keyword: '드라마 결말 해석', title: '네이트 콘텐츠 관심', description: '회차별 리뷰와 원작 비교형 글감에 맞습니다.', priority: 79, categoryId: 'entertainment' },
    { keyword: '오늘의 운세', title: '네이트 생활 검색', description: '띠별, 별자리, 월간 운세로 확장됩니다.', priority: 77, categoryId: 'living' },
  ],
  zum: [
    { keyword: '여름휴가 숙소', title: '줌 여행 수요', description: '가격, 지역, 예약 시점 검색이 같이 움직입니다.', priority: 94, categoryId: 'travel' },
    { keyword: '주말 가볼만한 곳', title: '줌 생활 관심', description: '지역별 추천과 코스형 글감으로 나누기 좋습니다.', priority: 92, categoryId: 'travel' },
    { keyword: '항공권 특가', title: '줌 여행 검색', description: '노선, 날짜, 카드 혜택 비교형으로 확장됩니다.', priority: 90, categoryId: 'travel' },
    { keyword: '캠핑장 예약', title: '줌 레저 흐름', description: '지역명, 시설, 후기형 검색이 붙는 후보입니다.', priority: 88, categoryId: 'leisure' },
    { keyword: '워터파크 할인', title: '줌 시즌 수요', description: '입장권, 카드, 지역형 구매 의도가 강합니다.', priority: 86, categoryId: 'leisure' },
    { keyword: '장마철 빨래 냄새', title: '줌 생활 문제', description: '해결법, 제품, 관리 팁으로 전환하기 좋습니다.', priority: 84, categoryId: 'living' },
    { keyword: '제습기 전기세', title: '줌 가전 비교', description: '사용시간, 전력량, 제품 비교 검색이 이어집니다.', priority: 82, categoryId: 'shopping' },
    { keyword: '모기 퇴치 방법', title: '줌 생활 검색', description: '제품 추천과 집안 관리형 글감으로 확장됩니다.', priority: 80, categoryId: 'living' },
    { keyword: '여름철 식중독 증상', title: '줌 건강 관심', description: '증상, 예방법, 병원 방문 기준 검색이 붙습니다.', priority: 78, categoryId: 'health' },
    { keyword: '휴가비 지원사업', title: '줌 정책 관심', description: '대상, 신청, 사용처 검색으로 이어지는 흐름입니다.', priority: 76, categoryId: 'policy' },
  ],
  policy: [
    { kind: 'policy', keyword: '소상공인 지원금 신청', title: '정책브리핑', description: '신청기간, 대상자, 지급일 검색 의도가 분명합니다.', priority: 98, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '청년 월세 지원 조건', title: '정책브리핑', description: '조건, 서류, 지자체 비교형 글감으로 전환됩니다.', priority: 96, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '에너지바우처 신청', title: '정책브리핑', description: '대상자와 신청 절차 검색이 꾸준히 붙습니다.', priority: 94, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '근로장려금 지급일', title: '정책브리핑', description: '조회, 지급일, 대상 확인 의도가 강합니다.', priority: 92, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '육아휴직 급여 신청', title: '정책브리핑', description: '신청 방법과 서류형 검색으로 확장됩니다.', priority: 90, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '국민내일배움카드 신청', title: '정책브리핑', description: '자격, 사용처, 훈련과정 검색이 붙습니다.', priority: 88, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '기초연금 수급자격', title: '정책브리핑', description: '나이, 소득인정액, 신청 방법으로 이어집니다.', priority: 86, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '전기차 보조금 조회', title: '정책브리핑', description: '지역, 차종, 신청 절차 검색 의도가 또렷합니다.', priority: 84, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '청년도약계좌 조건', title: '정책브리핑', description: '소득 기준, 납입, 은행 비교형으로 확장됩니다.', priority: 82, source: 'policy-briefing', categoryId: 'policy' },
    { kind: 'policy', keyword: '임신출산 진료비 지원', title: '정책브리핑', description: '지원금, 사용처, 신청 절차 검색이 붙습니다.', priority: 80, source: 'policy-briefing', categoryId: 'policy' },
  ],
  issue: [
    { kind: 'issue', keyword: '신작 드라마 출연진', title: '방송 이슈', description: '인물, 원작, 몇부작, 결말예상으로 확장됩니다.', priority: 95, source: 'entertainment-radar', categoryId: 'entertainment' },
    { kind: 'issue', keyword: '대표팀 경기 일정', title: '스포츠 이슈', description: '중계, 명단, 하이라이트 의도가 같이 붙습니다.', priority: 93, source: 'sports-radar', categoryId: 'sports' },
    { kind: 'issue', keyword: '스타 근황', title: '스타/연예 이슈', description: '방송 출연, 공식입장, 작품 정보로 이어집니다.', priority: 91, source: 'entertainment-radar', categoryId: 'entertainment' },
    { kind: 'issue', keyword: '예능 재방송', title: '방송 이슈', description: '회차, 다시보기, 편성표 검색으로 확장됩니다.', priority: 89, source: 'broadcast-radar', categoryId: 'broadcast' },
    { kind: 'issue', keyword: '프로야구 결과', title: '스포츠 이슈', description: '팀 순위, 하이라이트, 선발 명단 검색이 붙습니다.', priority: 87, source: 'sports-radar', categoryId: 'sports' },
    { kind: 'issue', keyword: '영화 개봉작', title: '문화 이슈', description: '평점, 쿠키영상, 관람 후기형으로 나누기 좋습니다.', priority: 85, source: 'culture-radar', categoryId: 'culture' },
    { kind: 'issue', keyword: '콘서트 티켓팅 일정', title: '공연 이슈', description: '예매처, 좌석, 취소표 검색 의도가 붙습니다.', priority: 83, source: 'culture-radar', categoryId: 'culture' },
    { kind: 'issue', keyword: '축제 일정', title: '지역 이슈', description: '지역명, 주차, 먹거리 정보로 확장됩니다.', priority: 81, source: 'local-radar', categoryId: 'local' },
    { kind: 'issue', keyword: 'OTT 신작 추천', title: '콘텐츠 이슈', description: '장르, 순위, 결말 리뷰형 검색이 붙습니다.', priority: 79, source: 'entertainment-radar', categoryId: 'entertainment' },
    { kind: 'issue', keyword: '오늘 뉴스 속보', title: '사회 이슈', description: '핵심 정리와 관련 인물 검색으로 이어집니다.', priority: 77, source: 'news-radar', categoryId: 'news' },
  ],
};

function publicFallbackKindForLane(laneId: PublicSourceLaneId): MobileSignalItem['kind'] {
  if (laneId === 'policy') return 'policy';
  if (laneId === 'issue') return 'issue';
  return 'realtime';
}

function buildPublicLaneFallbacks(laneId: PublicSourceLaneId): MobileSignalItem[] {
  return PUBLIC_SOURCE_LANE_FALLBACKS[laneId].map((seed, index) => makeSignal(
    seed.kind || publicFallbackKindForLane(laneId),
    `public-${laneId}-${index + 1}`,
    seed.keyword,
    seed.title,
    seed.description,
    seed.priority,
    seed.source || laneId,
    seed.categoryId || laneId,
  ));
}

function signalUniqueKey(item: MobileSignalItem): string {
  return `${item.source || ''}|${item.keyword || ''}|${item.title || ''}`.trim().toLowerCase();
}

function fillSignalLane(
  primary: MobileSignalItem[],
  laneId: PublicSourceLaneId,
  fallbackItems: MobileSignalItem[] = [],
): MobileSignalItem[] {
  const result: MobileSignalItem[] = [];
  const seen = new Set<string>();
  const push = (item: MobileSignalItem | undefined) => {
    if (!item || result.length >= PUBLIC_SOURCE_LANE_LIMIT) return;
    const key = signalUniqueKey(item) || item.id;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  };

  primary.forEach(push);
  fallbackItems.forEach(push);
  buildPublicLaneFallbacks(laneId).forEach(push);
  return result.slice(0, PUBLIC_SOURCE_LANE_LIMIT);
}

function pickRealtimeSignals(
  realtime: MobileSignalItem[],
  tokens: string[],
  fallback: MobileSignalItem | undefined,
  laneId: PublicSourceLaneId,
): MobileSignalItem[] {
  const matched = realtime.filter((item) => signalMatches(item, tokens));
  const fallbackItems = fallback && signalMatches(fallback, tokens) ? [fallback] : [];
  return fillSignalLane(matched, laneId, fallbackItems);
}

export function buildPublicSourceSignalPayload(snapshot: MobileSourceSignalSnapshot): PublicSourceSignalPayload {
  const clean = cleanPublicSourceSignals(snapshot);
  const realtime = clean.realtime || [];
  const lanes: PublicSourceSignalLane[] = [
    {
      id: 'naver',
      label: '네이버',
      description: '네이버 실시간, 뉴스, 검색 수요 신호',
      items: pickRealtimeSignals(realtime, ['naver', '네이버'], realtime[0], 'naver'),
    },
    {
      id: 'daum',
      label: '다음',
      description: '다음 랭킹과 생활/뉴스 신호',
      items: pickRealtimeSignals(realtime, ['daum', '다음'], realtime[1], 'daum'),
    },
    {
      id: 'nate',
      label: '네이트',
      description: '네이트 이슈/랭킹 신호',
      items: pickRealtimeSignals(realtime, ['nate', '네이트'], realtime[2], 'nate'),
    },
    {
      id: 'zum',
      label: '줌',
      description: '줌 실시간/이슈 신호',
      items: pickRealtimeSignals(realtime, ['zum', '줌', 'zuminternet'], realtime[3], 'zum'),
    },
    {
      id: 'policy',
      label: '정책',
      description: '정책브리핑, 지원금, 공공 알림 신호',
      items: fillSignalLane(clean.policy || [], 'policy'),
    },
    {
      id: 'issue',
      label: '이슈',
      description: '방송, 연예, 스포츠, 사회 이슈 신호',
      items: fillSignalLane(clean.issues || [], 'issue'),
    },
  ];
  return {
    ok: true,
    updatedAt: clean.updatedAt,
    fallbackUsed: clean.fallbackUsed,
    lanes: lanes.map((lane) => ({
      ...lane,
      items: lane.items.slice(0, PUBLIC_SOURCE_LANE_LIMIT),
    })),
    snapshot: clean,
  };
}

export function renderLewordLanding(): string {
  return renderLewordProWeb();
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LEWORD LIVE 황금키워드</title>
  <meta name="description" content="실시간 검색어, 정책브리핑, 스타·연예 이슈와 LIVE 황금키워드 맛보기를 확인하세요." />
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --panel: #101b2d;
      --panel-soft: #16243a;
      --line: #2c3d59;
      --text: #f7fbff;
      --muted: #9fb1c8;
      --gold: #f8c21b;
      --lime: #9cff38;
      --green: #16c784;
      --orange: #ff7a2f;
      --red: #ff4d58;
      --blue: #35b7ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 20% 0%, rgba(156,255,56,.12), transparent 28%),
        radial-gradient(circle at 82% 4%, rgba(248,194,27,.16), transparent 24%),
        var(--bg);
      color: var(--text);
      letter-spacing: 0;
    }
    a { color: inherit; text-decoration: none; }
    button { font: inherit; }
    .shell { max-width: 1180px; margin: 0 auto; padding: 24px 18px 56px; }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 0 22px;
    }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 900; font-size: 22px; }
    .brand-mark {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--gold), var(--lime));
      color: #07111f;
      font-weight: 1000;
    }
    .nav { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 14px; }
    .nav a,
    .nav button {
      border: 1px solid var(--line);
      background: rgba(255,255,255,.04);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 8px;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr);
      gap: 18px;
      align-items: stretch;
      margin-top: 4px;
    }
    .hero-copy,
    .live-board,
    .lane,
    .pro-strip,
    .source-panel,
    .feature-panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(16,27,45,.88);
      box-shadow: 0 18px 50px rgba(0,0,0,.28);
    }
    .hero-copy {
      padding: 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 430px;
    }
    .eyebrow { color: var(--lime); font-size: 13px; font-weight: 900; text-transform: uppercase; }
    h1 {
      margin: 12px 0 12px;
      font-size: 48px;
      line-height: 1.08;
      letter-spacing: 0;
      word-break: keep-all;
      overflow-wrap: break-word;
    }
    .lead {
      margin: 0;
      color: #c8d5e7;
      font-size: 18px;
      line-height: 1.65;
      max-width: 680px;
      word-break: keep-all;
    }
    .hero-actions,
    .source-links,
    .feature-grid,
    .keyword-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .hero-actions { margin-top: 26px; }
    .primary,
    .secondary,
    .tiny-btn,
    .source-link,
    .feature-btn {
      border-radius: 8px;
      font-weight: 900;
      cursor: pointer;
    }
    .primary,
    .secondary {
      border: 0;
      padding: 14px 18px;
    }
    .primary { background: linear-gradient(135deg, var(--gold), var(--lime)); color: #07111f; }
    .secondary { background: #1a2a43; color: var(--text); border: 1px solid var(--line); }
    .metric-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 30px; }
    .metric { border-top: 1px solid var(--line); padding-top: 14px; }
    .metric strong { display: block; font-size: 24px; color: var(--gold); }
    .metric span { display: block; color: var(--muted); font-size: 13px; margin-top: 4px; }
    .live-board { padding: 20px; min-height: 430px; }
    .section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .section-title h2 { margin: 0; font-size: 20px; letter-spacing: 0; word-break: keep-all; }
    .pill {
      border: 1px solid rgba(156,255,56,.45);
      color: var(--lime);
      background: rgba(156,255,56,.08);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 900;
      white-space: nowrap;
    }
    .progress { height: 10px; background: #0a1322; border-radius: 999px; overflow: hidden; border: 1px solid var(--line); }
    .progress > div { height: 100%; width: 0%; background: linear-gradient(90deg, var(--gold), var(--lime)); transition: width .35s ease; }
    .board-meta { display: flex; justify-content: space-between; color: var(--muted); font-size: 13px; margin: 10px 0 14px; gap: 12px; }
    .keyword-list { display: grid; gap: 9px; }
    .keyword-card {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      border: 1px solid #273954;
      background: rgba(7,17,31,.72);
      border-radius: 8px;
      min-height: 78px;
    }
    .rank { color: var(--gold); font-size: 13px; font-weight: 1000; }
    .keyword-main { min-width: 0; }
    .keyword-main strong { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 16px; }
    .keyword-main span { display: block; color: var(--muted); margin-top: 5px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .grade {
      min-width: 50px;
      text-align: center;
      border-radius: 999px;
      padding: 7px 9px;
      background: var(--red);
      color: white;
      font-size: 12px;
      font-weight: 1000;
    }
    .grade.ss { background: var(--orange); }
    .grade.s { background: var(--gold); color: #07111f; }
    .keyword-actions {
      grid-column: 2 / 4;
      margin-top: -2px;
    }
    .tiny-btn {
      border: 1px solid var(--line);
      background: #1a2a43;
      color: var(--text);
      padding: 7px 10px;
      font-size: 12px;
    }
    .tiny-btn.pro { border-color: rgba(248,194,27,.55); color: var(--gold); }
    .locked {
      margin-top: 10px;
      border: 1px dashed rgba(248,194,27,.45);
      border-radius: 8px;
      padding: 14px;
      color: #dce7f6;
      background: rgba(248,194,27,.06);
      font-size: 14px;
      line-height: 1.55;
    }
    .pro-modal {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(2, 6, 23, 0.78);
    }
    .pro-modal.open { display: flex; }
    .pro-dialog {
      width: min(420px, 100%);
      border: 1px solid rgba(53,183,255,.42);
      border-radius: 8px;
      background: #0f172a;
      box-shadow: 0 24px 80px rgba(0,0,0,.42);
      padding: 22px;
    }
    .pro-dialog h2 { margin: 0 0 8px; font-size: 22px; }
    .pro-dialog p { margin: 0 0 16px; color: var(--muted); line-height: 1.6; }
    .pro-dialog label {
      display: block;
      margin: 12px 0 6px;
      color: #cbd5e1;
      font-size: 13px;
      font-weight: 800;
    }
    .pro-dialog input {
      width: 100%;
      border: 1px solid rgba(148,163,184,.28);
      border-radius: 8px;
      background: #020617;
      color: var(--text);
      padding: 12px 13px;
      font-size: 14px;
    }
    .pro-dialog-actions { display: flex; gap: 10px; margin-top: 18px; }
    .pro-dialog-actions button { flex: 1; }
    .pro-message { min-height: 20px; margin-top: 12px; color: #93c5fd; font-size: 13px; line-height: 1.5; }
    .pro-license {
      margin-top: 12px;
      border: 1px solid rgba(53,183,255,.24);
      border-radius: 8px;
      background: rgba(2,6,23,.46);
      padding: 10px 12px;
    }
    .pro-license summary {
      cursor: pointer;
      color: var(--gold);
      font-weight: 900;
      font-size: 13px;
    }
    .pro-license p { margin: 8px 0 10px; font-size: 12px; }
    .lanes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; }
    .lane { padding: 18px; }
    .lane h3 { margin: 0 0 12px; font-size: 17px; }
    .signal { padding: 12px 0; border-top: 1px solid var(--line); }
    .signal:first-of-type { border-top: 0; }
    .signal strong { display: block; font-size: 15px; }
    .signal span { display: block; margin-top: 5px; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .source-badge {
      display: inline-block;
      margin-top: 8px;
      border: 1px solid rgba(53,183,255,.45);
      border-radius: 999px;
      padding: 4px 8px;
      color: #bfe9ff;
      background: rgba(53,183,255,.08);
      font-size: 11px;
      font-weight: 900;
    }
    .source-panel,
    .feature-panel {
      margin-top: 18px;
      padding: 20px;
    }
    .source-panel h2,
    .feature-panel h2 { margin: 0 0 12px; font-size: 21px; }
    .source-link,
    .feature-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      border: 1px solid var(--line);
      background: #1a2a43;
      color: var(--text);
      padding: 10px 13px;
      font-size: 14px;
    }
    .source-link.hot { border-color: rgba(156,255,56,.45); color: var(--lime); }
    .feature-btn {
      border-color: rgba(248,194,27,.45);
      color: var(--gold);
      background: rgba(248,194,27,.06);
    }
    .pro-strip {
      margin-top: 18px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 16px;
      padding: 20px;
      border-color: rgba(156,255,56,.32);
      background: linear-gradient(135deg, rgba(22,199,132,.18), rgba(16,27,45,.9));
    }
    .pro-strip h2 { margin: 0 0 6px; font-size: 22px; }
    .pro-strip p,
    .panel-copy { margin: 0 0 14px; color: #c7d5e5; line-height: 1.55; word-break: keep-all; }
    @media (max-width: 880px) {
      .hero,
      .lanes,
      .pro-strip { grid-template-columns: 1fr; }
      .hero-copy { min-height: auto; }
      h1 { font-size: 32px; }
      .metric-row { grid-template-columns: 1fr; }
      .nav { display: none; }
      .keyword-card { grid-template-columns: 40px minmax(0, 1fr) auto; }
      .keyword-actions { grid-column: 1 / 4; }
    }
    @media (max-width: 520px) {
      .shell { padding: 18px 12px 42px; }
      h1 { font-size: 29px; }
      .lead { font-size: 16px; }
      .section-title,
      .board-meta { align-items: flex-start; flex-direction: column; }
      .section-title h2 { font-size: 18px; }
      .keyword-card { grid-template-columns: 34px minmax(0, 1fr); }
      .grade { grid-column: 2; justify-self: start; }
      .keyword-actions { grid-column: 1 / 3; }
      .keyword-main strong,
      .keyword-main span { white-space: normal; }
      .source-link,
      .feature-btn,
      .primary,
      .secondary { width: 100%; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/leword"><span class="brand-mark">L</span><span>LEWORD</span></a>
      <nav class="nav">
        <a href="#signals">실시간 이슈</a>
        <a href="#golden">황금 맛보기</a>
        <a href="#sources">소스 바로가기</a>
        <button type="button" data-action="pro">Pro 로그인</button>
      </nav>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <div>
          <div class="eyebrow">24H LIVE KEYWORD RADAR</div>
          <h1>앱을 꺼도 서버가 계속 찾는 황금키워드 보드</h1>
          <p class="lead">실시간 검색어, 정책브리핑, 스타·연예·방송·스포츠 이슈를 먼저 감지하고, 검색량과 문서수를 실측한 후보만 120개 보드에 채웁니다. 공개 화면은 하위 5개 맛보기만 보여주고, 원본 순위와 정확 수치는 Pro에서 보호합니다.</p>
          <div class="hero-actions">
            <a class="primary" href="#golden">LIVE 보드 보기</a>
            <a class="secondary" href="#signals">오늘 이슈 보기</a>
          </div>
        </div>
        <div class="metric-row">
          <div class="metric"><strong id="metricBoard">0/120</strong><span>검증 보드</span></div>
          <div class="metric"><strong id="metricLocked">0</strong><span>Pro 잠금 키워드</span></div>
          <div class="metric"><strong id="metricState">대기</strong><span>서버 상태</span></div>
        </div>
      </div>

      <section id="golden" class="live-board">
        <div class="section-title">
          <h2>LIVE 황금키워드 맛보기</h2>
          <span class="pill" id="previewPolicy">하위 5개 공개</span>
        </div>
        <div class="progress"><div id="boardProgress"></div></div>
        <div class="board-meta">
          <span id="boardCount">보드 준비 중</span>
          <span id="boardUpdated">업데이트 대기</span>
        </div>
        <div id="keywordList" class="keyword-list"></div>
        <div id="lockedNotice" class="locked">정확 검색량·문서수·황금비율·CPC·전체 120개 원본 순위는 LEWORD Pro에서만 공개됩니다.</div>
      </section>
    </section>

    <section id="signals" class="lanes">
      <div class="lane"><h3>실시간 검색 흐름</h3><div id="laneRealtime">
        <div class="signal"><strong>여름 원피스 추천</strong><span>계절 수요가 높습니다. 추천, 코디, 사이즈, 브랜드 비교형으로 쪼개서 검증하세요.</span><span class="source-badge">네이버</span></div>
        <div class="signal"><strong>장마 준비물</strong><span>장마, 제습, 침수 예방처럼 구매와 생활 정보가 붙는 하위 키워드가 좋습니다.</span><span class="source-badge">다음</span></div>
        <div class="signal"><strong>오늘 방송 출연진</strong><span>방송 직후 회차, 재방송, 출연진, 결말 키워드로 빠르게 선점합니다.</span><span class="source-badge">네이트</span></div>
        <div class="signal"><strong>여름휴가 숙소</strong><span>지역, 일정, 가격 조건을 붙이면 작성 가능한 키워드로 바뀝니다.</span><span class="source-badge">Google</span></div>
      </div></div>
      <div class="lane"><h3>정책·지원금 브리핑</h3><div id="lanePolicy">
        <div class="signal"><strong>근로장려금 지급일</strong><span>신청기간, 지급일, 대상자 확인으로 글감을 나누면 검색 의도가 명확합니다.</span><span class="source-badge">정책브리핑</span></div>
        <div class="signal"><strong>청년 월세 지원 조건</strong><span>조건, 신청, 중도해지, 지역 비교형으로 확장하기 좋습니다.</span><span class="source-badge">정책브리핑</span></div>
      </div></div>
      <div class="lane"><h3>스타·연예·이슈</h3><div id="laneIssues">
        <div class="signal"><strong>신작 드라마 출연진</strong><span>몇부작, 원작, 인물관계도, 결말예상으로 바로 확장 가능합니다.</span><span class="source-badge">연예 이슈</span></div>
        <div class="signal"><strong>대표팀 경기 일정</strong><span>중계, 명단, 하이라이트, 결과 키워드로 빠르게 선점하세요.</span><span class="source-badge">스포츠 이슈</span></div>
      </div></div>
    </section>

    <section id="sources" class="source-panel">
      <h2>실시간 소스 바로가기</h2>
      <p class="panel-copy">네이버, 다음, 네이트, Google, ZUM, 정책브리핑 흐름을 한 화면에서 확인하고 Pro 분석으로 넘기는 입구입니다.</p>
      <div class="source-links">
        <a class="source-link hot" href="https://signal.bz/news" target="_blank" rel="noopener noreferrer">네이버 실시간</a>
        <a class="source-link" href="https://news.daum.net/ranking/popular" target="_blank" rel="noopener noreferrer">다음 랭킹</a>
        <a class="source-link" href="https://news.nate.com/rank/interest" target="_blank" rel="noopener noreferrer">네이트 랭킹</a>
        <a class="source-link" href="https://trends.google.com/trends/trendingsearches/daily?geo=KR" target="_blank" rel="noopener noreferrer">Google Trends</a>
        <a class="source-link" href="https://issue.zum.com/" target="_blank" rel="noopener noreferrer">ZUM 이슈</a>
        <a class="source-link" href="https://www.korea.kr/news/policyNewsList.do" target="_blank" rel="noopener noreferrer">정책브리핑</a>
      </div>
    </section>

    <section class="feature-panel">
      <h2>Pro 기능 입구</h2>
      <p class="panel-copy">PC 앱의 핵심 기능은 Pro 로그인 뒤 정확 수치와 함께 연결됩니다. 공개 페이지에서는 맛보기와 바로가기만 제공합니다.</p>
      <div class="feature-grid">
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="mindmap">마인드맵 확장</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="analysis">정밀 키워드 분석</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="traffic">트래픽 헌터 Pro</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="export">엑셀 다운로드</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="draft">블로그 초안 전송</button>
        <button class="feature-btn" type="button" data-action="pro-feature" data-feature="image">이미지 생성 크레딧</button>
      </div>
    </section>

    <section class="pro-strip">
      <div>
        <h2>Pro에서는 바로 작업까지 이어집니다</h2>
        <p>120개 전체 보드, 원본 순위, 정확 검색량·문서수, 마인드맵 확장, 블로그스팟·워드프레스 초안 전송, 이미지 생성 크레딧까지 서버 계정으로 묶어갑니다.</p>
      </div>
      <a class="primary" href="/v1/public/live-golden">공개 API 보기</a>
    </section>
  </main>
  <div class="pro-modal" id="proLoginModal" aria-hidden="true">
    <form class="pro-dialog" id="proLoginForm">
      <h2>LEWORD Pro 로그인</h2>
      <p>기존 사용자는 아이디와 비밀번호만 입력하면 됩니다.</p>
      <label for="proUserId">아이디</label>
      <input id="proUserId" name="userId" autocomplete="username" required />
      <label for="proPassword">비밀번호</label>
      <input id="proPassword" name="password" type="password" autocomplete="current-password" required />
      <details class="pro-license">
        <summary>라이선스 키로 인증하기</summary>
        <p>구매 또는 등록 키가 있는 경우에만 입력하세요. 평소에는 아이디와 비밀번호만으로 로그인됩니다.</p>
        <label for="proLicenseCode">라이선스 키</label>
        <input id="proLicenseCode" name="licenseCode" autocomplete="off" placeholder="LEWORD-XXXX-XXXX" />
      </details>
      <div class="pro-dialog-actions">
        <button class="primary" type="submit">로그인</button>
        <button class="secondary" type="button" id="proLoginClose">닫기</button>
      </div>
      <div class="pro-message" id="proLoginMessage"></div>
    </form>
  </div>

  <script>
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const escapeAttr = (value) => escapeHtml(value).replace(/\\n/g, ' ');
    const fmtTime = (value) => value ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '대기';
    const gradeClass = (grade) => grade === 'SS' ? 'ss' : grade === 'S' ? 's' : '';
    let proSession = null;

    function restoreProSession() {
      try {
        const saved = JSON.parse(localStorage.getItem('leword.pro.session') || 'null');
        if (saved && saved.accessToken) proSession = saved;
      } catch {
        proSession = null;
      }
      renderProSessionState();
    }

    function renderProSessionState() {
      const button = document.querySelector('[data-action="pro"]');
      if (button) button.textContent = proSession ? 'Pro 접속중' : 'Pro 로그인';
      const notice = document.getElementById('lockedNotice');
      if (notice && proSession) notice.textContent = 'Pro 로그인 완료. 전체 보드와 정확 지표를 불러옵니다.';
    }

    function openProLogin() {
      document.getElementById('proLoginModal').classList.add('open');
      document.getElementById('proLoginModal').setAttribute('aria-hidden', 'false');
      setTimeout(() => document.getElementById('proUserId').focus(), 0);
    }

    function closeProLogin() {
      document.getElementById('proLoginModal').classList.remove('open');
      document.getElementById('proLoginModal').setAttribute('aria-hidden', 'true');
    }

    function renderKeywords(payload) {
      const list = document.getElementById('keywordList');
      const items = payload.publicPreview || [];
      if (!items.length) {
        list.innerHTML = '<div class="locked">서버가 첫 후보를 검증하는 중입니다. API 키가 연결되면 결과가 자동으로 채워집니다.</div>';
        return;
      }
      list.innerHTML = items.map((item) => '<article class="keyword-card">'
        + '<div class="rank">#' + escapeHtml(item.rank) + '</div>'
        + '<div class="keyword-main"><strong>' + escapeHtml(item.keyword) + '</strong><span>'
        + '검색량 ' + escapeHtml(item.publicSearchVolumeLabel) + ' · 문서수 ' + escapeHtml(item.publicDocumentCountLabel) + ' · ' + escapeHtml(item.publicReason)
        + '</span></div>'
        + '<div class="grade ' + gradeClass(item.grade) + '">' + escapeHtml(item.grade) + '</div>'
        + '<div class="keyword-actions">'
        + '<button class="tiny-btn" type="button" data-action="search" data-keyword="' + escapeAttr(item.keyword) + '">네이버 검색</button>'
        + '<button class="tiny-btn" type="button" data-action="google-search" data-keyword="' + escapeAttr(item.keyword) + '">Google</button>'
        + '<button class="tiny-btn pro" type="button" data-action="pro-keyword" data-keyword="' + escapeAttr(item.keyword) + '">Pro 분석</button>'
        + '</div>'
        + '</article>').join('');
    }

    function renderProKeywords(snapshot) {
      const list = document.getElementById('keywordList');
      const target = Math.max(60, Math.min(120, Number(snapshot.boardTarget || 120)));
      const items = (snapshot.board || []).slice(0, target);
      if (!items.length) {
        list.innerHTML = '<div class="locked">Pro 보드가 아직 준비 중입니다.</div>';
        return;
      }
      document.getElementById('metricBoard').textContent = snapshot.boardCount + '/' + snapshot.boardTarget;
      document.getElementById('metricLocked').textContent = '0';
      document.getElementById('metricState').textContent = snapshot.running ? '발굴중' : '접속중';
      document.getElementById('previewPolicy').textContent = 'Pro 전체 공개';
      document.getElementById('lockedNotice').textContent = 'Pro 로그인 상태입니다. 전체 순위와 정확 지표를 표시합니다.';
      list.innerHTML = items.map((item) => '<article class="keyword-card">'
        + '<div class="rank">#' + escapeHtml(item.rank) + '</div>'
        + '<div class="keyword-main"><strong>' + escapeHtml(item.keyword) + '</strong><span>'
        + '검색량 ' + escapeHtml(item.totalSearchVolume ?? '-') + ' · 문서수 ' + escapeHtml(item.documentCount ?? '-') + ' · 황금비율 ' + escapeHtml(item.goldenRatio ?? '-')
        + '</span></div>'
        + '<div class="grade ' + gradeClass(item.grade) + '">' + escapeHtml(item.grade) + '</div>'
        + '<div class="keyword-actions">'
        + '<button class="tiny-btn" type="button" data-action="search" data-keyword="' + escapeAttr(item.keyword) + '">네이버 검색</button>'
        + '<button class="tiny-btn pro" type="button" data-action="pro-keyword" data-keyword="' + escapeAttr(item.keyword) + '">Pro 분석</button>'
        + '</div>'
        + '</article>').join('');
    }

    async function loadProBoard() {
      if (!proSession?.accessToken) return false;
      try {
        const res = await fetch('/v1/live-golden/snapshot', {
          cache: 'no-store',
          headers: { Authorization: 'Bearer ' + proSession.accessToken },
        });
        if (!res.ok) return false;
        const payload = await res.json();
        if (payload?.snapshot) {
          renderProKeywords(payload.snapshot);
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }

    function renderSignals(targetId, items) {
      const target = document.getElementById(targetId);
      const rows = (items || []).slice(0, 4);
      if (!rows.length) {
        target.innerHTML = '<div class="signal"><span>소스 연결을 확인하는 중입니다.</span></div>';
        return;
      }
      target.innerHTML = rows.map((item) => '<div class="signal">'
        + '<strong>' + escapeHtml(item.keyword) + '</strong>'
        + '<span>' + escapeHtml(item.description) + '</span>'
        + '<span class="source-badge">' + escapeHtml(item.source) + '</span>'
        + '</div>').join('');
    }

    async function loadLive() {
      if (await loadProBoard()) return;
      try {
        const res = await fetch('/v1/public/live-golden', { cache: 'no-store' });
        const payload = await res.json();
        const pct = Math.min(100, Math.round((payload.boardCount / Math.max(1, payload.boardTarget)) * 100));
        document.getElementById('metricBoard').textContent = payload.boardCount + '/' + payload.boardTarget;
        document.getElementById('metricLocked').textContent = payload.lockedCount;
        document.getElementById('metricState').textContent = payload.running ? '발굴중' : '대기';
        document.getElementById('boardProgress').style.width = pct + '%';
        document.getElementById('boardCount').textContent = '현재 ' + payload.boardCount + ' / ' + payload.boardTarget + '개 검증';
        document.getElementById('boardUpdated').textContent = '최근 갱신 ' + fmtTime(payload.updatedAt);
        document.getElementById('previewPolicy').textContent = payload.previewPolicyLabel || '하위 5개 공개';
        document.getElementById('lockedNotice').textContent = '더미가 아니라 ' + payload.measurementSourceLabel + ' 실측 기반입니다. 공개 화면은 범위만 표시하고 정확 수치는 Pro에서만 공개됩니다.';
        renderKeywords(payload);
      } catch {
        document.getElementById('metricState').textContent = '점검';
      }
    }

    async function loadSignals() {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch('/v1/public/source-signals', { cache: 'no-store', signal: controller.signal });
        const payload = await res.json();
        renderSignals('laneRealtime', payload.snapshot.realtime);
        renderSignals('lanePolicy', payload.snapshot.policy);
        renderSignals('laneIssues', payload.snapshot.issues);
      } catch {
        return;
      } finally {
        clearTimeout(timeout);
      }
    }

    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.getAttribute('data-action');
      const keyword = target.getAttribute('data-keyword') || '';
      if (action === 'search') {
        window.open('https://search.naver.com/search.naver?query=' + encodeURIComponent(keyword), '_blank', 'noopener,noreferrer');
      } else if (action === 'google-search') {
        window.open('https://www.google.com/search?q=' + encodeURIComponent(keyword), '_blank', 'noopener,noreferrer');
      } else if (action === 'pro-keyword' || action === 'pro' || action === 'pro-feature') {
        if (!proSession) {
          openProLogin();
          return;
        }
        loadProBoard();
      }
    });

    document.getElementById('proLoginClose').addEventListener('click', closeProLogin);
    document.getElementById('proLoginModal').addEventListener('click', (event) => {
      if (event.target.id === 'proLoginModal') closeProLogin();
    });
    document.getElementById('proLoginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('proLoginMessage');
      const userId = document.getElementById('proUserId').value.trim();
      const password = document.getElementById('proPassword').value.trim();
      const licenseCode = document.getElementById('proLicenseCode').value.trim();
      if (!userId || !password) {
        message.textContent = '아이디와 비밀번호를 입력해주세요.';
        return;
      }
      message.textContent = '로그인 중입니다...';
      try {
        const res = await fetch('/v1/web/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(licenseCode ? { userId, password, licenseCode } : { userId, password }),
        });
        const payload = await res.json();
        if (!res.ok || !payload?.session?.accessToken) {
          message.textContent = payload?.message || '로그인에 실패했습니다.';
          return;
        }
        proSession = payload.session;
        localStorage.setItem('leword.pro.session', JSON.stringify(proSession));
        renderProSessionState();
        closeProLogin();
        await loadProBoard();
      } catch (err) {
        message.textContent = err?.message || '로그인에 실패했습니다.';
      }
    });

    restoreProSession();
    loadLive();
    loadSignals();
    setInterval(loadLive, 15000);
    setInterval(loadSignals, 60000);
  </script>
</body>
</html>`;
}
