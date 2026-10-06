/**
 * 글 한 편 유입 설계실 — 순수 판정 · 정리 함수(2026-10-06 사장님 승인 "진행").
 *
 * 키워드 하나로 ① 이길 수 있나 ② 제목 ③ 사람들이 실제로 물은 것 ④ 돈 을 한 화면에 모은다.
 * 여기는 계산만 한다(네트워크 · 파일 없음). 추정치(확률 · 예상 유입)는 만들지 않고 받은 값을 정리만 한다.
 */

export interface PlanQuestion {
  title: string;
  link: string;
  /** '지식인' · '카페 · 카페이름' · 커뮤니티 이름 */
  where: string;
  postdate: string;
}

export interface AffiliateCandidate {
  name: string;
  platform: string;
  keyword: string;
  price: number | null;
  reward: string;
  link: string;
}

export interface PostPlanStep<T> {
  ok: boolean;
  data?: T;
  /** 못 한 이유 — 화면에 그대로 적는다. */
  note?: string;
}

export interface PostPlan {
  id: string;
  keyword: string;
  createdAt: string;
  updatedAt: string;
  steps: Partial<Record<'judge' | 'titles' | 'questions' | 'money' | 'inflow', PostPlanStep<unknown>>>;
}

interface RadarLikeItem {
  source?: string;
  title?: string;
  link?: string;
  postdate?: string;
  postedAt?: string;
  cafeName?: string;
  siteName?: string;
  linkPolicy?: string;
  policyWhy?: string;
}

const whereOf = (item: RadarLikeItem): string => {
  if (item.source === 'kin') return '지식인';
  if (item.source === 'cafearticle') return item.cafeName ? `카페 · ${item.cafeName}` : '카페';
  return item.siteName || '커뮤니티';
};

/**
 * 레이더 검색 결과 → 글에 담을 질문 체크리스트. 최근 글부터, 같은 주소는 한 번.
 * 작성일 없는 글은 넣지 않는다 — 서버(워커)가 14일 안의 글만 보내지만 한 번 더 막는다.
 */
export function questionChecklist(items: readonly RadarLikeItem[], limit: number, keyword = ''): PlanQuestion[] {
  const seen = new Set<string>();
  const when = (item: RadarLikeItem) => Date.parse(item.postedAt || `${item.postdate}T00:00:00+09:00`) || 0;
  /*
   * 관련성(2026-10-06 실주행 '자동차 보험 갱신'): 카페 검색은 낱말 하나만 맞아도 줘서 '개인회생' · '장갑차 대형면허 갱신'이
   * 섞였다. 키워드 낱말(2자 이상) 절반 이상이 제목(띄어쓰기 뺀)에 든 것만 남긴다.
   */
  const words = String(keyword).split(/\s+/).filter((w) => w.length >= 2);
  const relevant = (title: string) => {
    if (!words.length) return true;
    const compactTitle = title.replace(/\s+/g, '');
    return words.filter((w) => compactTitle.includes(w)).length * 2 >= words.length;
  };
  return [...items]
    .filter((item) => item && item.title && item.link && item.postdate && relevant(String(item.title)))
    .sort((a, b) => when(b) - when(a))
    .filter((item) => {
      const key = String(item.link);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((item) => ({ title: String(item.title), link: String(item.link), where: whereOf(item), postdate: String(item.postdate) }));
}

/** 상품 맞추기에서 버리는 낱말 — 어느 상품에나 붙는 말이라 겹쳐도 관련이 없다. */
const AFFILIATE_STOP = new Set(['할인', '방법', '추천', '후기', '가격', '비교', '정리', '신청', '갱신', '이유', '종류', '차이', '꿀팁']);

/**
 * 키워드와 관련된 제휴 상품 후보. 키워드 낱말(2자 이상)이 상품 이름 · 검색어에 든 것만,
 * 겹친 낱말 길이 합이 큰 순(같으면 받은 순서). 겹치는 게 없으면 빈 목록 — 억지로 채우지 않는다.
 * '후보'일 뿐 성과 판정이 아니다(화면도 그렇게 적는다).
 */
export function affiliateCandidates(keyword: string, snapshot: any, limit: number): AffiliateCandidate[] {
  const words = [...new Set(String(keyword || '').split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2 && !AFFILIATE_STOP.has(w)))];
  if (!words.length || !snapshot || typeof snapshot !== 'object' || !snapshot.sites) return [];
  const scored: Array<{ score: number; order: number; item: AffiliateCandidate }> = [];
  let order = 0;
  for (const site of Object.values<any>(snapshot.sites)) {
    for (const item of Array.isArray(site?.items) ? site.items : []) {
      const text = `${item?.name || ''} ${item?.keyword || ''}`;
      const score = words.filter((w) => text.includes(w)).reduce((sum, w) => sum + w.length, 0);
      order += 1;
      if (score === 0 || !item?.name) continue;
      scored.push({
        score,
        order,
        item: {
          name: String(item.name),
          platform: String(site?.label || ''),
          keyword: String(item.keyword || ''),
          price: typeof item.price === 'number' ? item.price : null,
          reward: String(item.reward || ''),
          link: String(item.url || item.link || ''),
        },
      });
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit).map((s) => s.item);
}

/** 설계 목록 — 같은 키워드는 새 설계로 바꾸고 맨 앞에. 상한을 넘으면 오래된 것부터 뺀다. 원본은 바꾸지 않는다. */
export function upsertPlan(list: readonly PostPlan[], plan: PostPlan, cap: number): PostPlan[] {
  const key = (k: string) => k.replace(/\s+/g, '');
  return [plan, ...list.filter((p) => key(p.keyword) !== key(plan.keyword))].slice(0, cap);
}

/*
 * ⑤ 발행 후 유입 — 링크 달 자리(2026-10-06 2차).
 * 평가 묶음은 사이트 레이더(RadarTab scoreFromAxes)와 같은 가중치 · 문턱이다 — 정본은 워커 RADAR_CONFIG.
 * 화면에는 점수(AI 가 매긴 값)를 숫자로 내지 않고 묶음과 근거만 보여 준다.
 */
const RADAR_WEIGHTS = { searchDemand: 0.15, commercialValue: 0.20, problemUrgency: 0.15, externalOpportunity: 0.20, siteFit: 0.15, freshness: 0.10, lowCompetitionBonus: 0.05 };
const RADAR_THRESHOLDS = { now: 80, watch: 60 };

export type RadarAction = 'NOW' | 'WATCH' | 'SKIP';

export function radarAction(a: Record<string, number>): RadarAction {
  const w = RADAR_WEIGHTS;
  const score = Math.round(
    (a.relevance || 0) * w.searchDemand
    + (a.commercialValue || 0) * w.commercialValue
    + (a.urgency || 0) * w.problemUrgency
    + (a.trafficPotential || 0) * w.externalOpportunity
    + (a.contentMatch || 0) * w.siteFit
    + (a.relevance || 0) * w.freshness
    + (100 - (a.spamRisk || 0)) * w.lowCompetitionBonus,
  );
  return score >= RADAR_THRESHOLDS.now ? 'NOW' : score >= RADAR_THRESHOLDS.watch ? 'WATCH' : 'SKIP';
}

export interface InflowSpot extends PlanQuestion {
  action: RadarAction | 'UNRATED';
  reason: string;
  /** 판의 링크 정책(커뮤니티) — 'careful' 이면 화면에 조심 표시. */
  linkPolicy: string;
  policyWhy: string;
  source: string;
}

/**
 * 검색 결과(레이더) + 평가(index 는 1부터, 검색 결과 순서) → 지금 답하면 유입 · 지켜볼 자리.
 * 제외(SKIP)는 세기만 하고, 평가를 못 받은 것은 따로 돌려준다(평가가 죽어도 자리는 보이게).
 */
export function inflowSpots(items: readonly RadarLikeItem[], evaluations: ReadonlyArray<Record<string, any>>): { spots: InflowSpot[]; unrated: InflowSpot[]; skipped: number; skippedSpots: InflowSpot[] } {
  const byIndex = new Map(evaluations.map((e) => [Number(e.index), e]));
  const spots: InflowSpot[] = [];
  const unrated: InflowSpot[] = [];
  let skipped = 0;
  const skippedSpots: InflowSpot[] = [];
  items.forEach((item, i) => {
    if (!item || !item.title || !item.link) return;
    const base = {
      title: String(item.title), link: String(item.link), where: whereOf(item), postdate: String(item.postdate || ''),
      linkPolicy: String(item.linkPolicy || ''), policyWhy: String(item.policyWhy || ''), source: String(item.source || ''),
    };
    const verdict = byIndex.get(i + 1);
    if (!verdict) { unrated.push({ ...base, action: 'UNRATED', reason: '' }); return; }
    const action = radarAction(verdict as Record<string, number>);
    if (action === 'SKIP') { skipped += 1; skippedSpots.push({ ...base, action, reason: String(verdict.why || '') }); return; }
    spots.push({ ...base, action, reason: String(verdict.why || '') });
  });
  const rank = (s: InflowSpot) => (s.action === 'NOW' ? 0 : 1);
  return { spots: spots.sort((a, b) => rank(a) - rank(b)), unrated, skipped, skippedSpots };
}

/**
 * 글 분석 키워드로 거르기(2026-10-06 2차 실주행: '우리들의 발라드2' 글에 '신용대출' · '임신 중 퇴사'가 섞였다 —
 * 네이버 검색이 '어떻게 되나요' 같은 문장형 질의에 느슨하게 맞는 글까지 준다).
 * 남기는 조건: 분석 구절(핵심어 · 짧은 말, 4자 이상)이 제목에 그대로 있거나,
 * 주제어(각 구절의 첫 낱말)가 제목에 있고 키워드 낱말이 둘 이상 겹칠 때. 일반어 하나만 겹치면 뺀다.
 */
export function filterByAnalysis<T extends { title?: string }>(items: readonly T[], analysis: { coreKeywords?: Array<{ keyword: string }>; shortQueries?: string[] }): T[] {
  const phrases = [...(analysis.coreKeywords || []).map((k) => String(k?.keyword || '')), ...(analysis.shortQueries || []).map(String)]
    .map((p) => p.trim()).filter(Boolean);
  if (!phrases.length) return [...items];
  const compactOf = (text: string) => text.replace(/\s+/g, '');
  const subjects = [...new Set(phrases.map((p) => p.split(/\s+/)[0]).filter((w) => w.length >= 2))];
  const words = [...new Set(phrases.flatMap((p) => p.split(/\s+/)).filter((w) => w.length >= 2))];
  return items.filter((item) => {
    const title = compactOf(String(item?.title || ''));
    if (!title) return false;
    if (phrases.some((p) => compactOf(p).length >= 4 && title.includes(compactOf(p)))) return true;
    return subjects.some((s) => title.includes(s)) && words.filter((w) => title.includes(w)).length >= 2;
  });
}
