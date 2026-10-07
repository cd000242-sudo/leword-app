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
  steps: Partial<Record<'judge' | 'titles' | 'searches' | 'questions' | 'money' | 'inflow' | 'result', PostPlanStep<unknown>>>;
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
export function questionChecklist(items: readonly RadarLikeItem[], limit: number, keyword = '', alsoKeywords: readonly string[] = []): PlanQuestion[] {
  const seen = new Set<string>();
  const when = (item: RadarLikeItem) => Date.parse(item.postedAt || `${item.postdate}T00:00:00+09:00`) || 0;
  /*
   * 관련성(2026-10-06 실주행 '자동차 보험 갱신'): 카페 검색은 낱말 하나만 맞아도 줘서 '개인회생' · '장갑차 대형면허 갱신'이
   * 섞였다. 키워드 낱말(2자 이상) 절반 이상이 제목(띄어쓰기 뺀)에 든 것만 남긴다.
   * 띄어쓰기 없는 키워드('가수주현미별세이유')는 낱말이 하나라 늘 0건이었다(2026-10-07) → 띄운 말(alsoKeywords)로도 본다.
   */
  const wordSets = [keyword, ...alsoKeywords].map((k) => String(k).split(/\s+/).filter((w) => w.length >= 2)).filter((ws) => ws.length);
  const relevant = (title: string) => {
    if (!wordSets.length) return true;
    const compactTitle = title.replace(/\s+/g, '');
    return wordSets.some((words) => words.filter((w) => compactTitle.includes(w)).length * 2 >= words.length);
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

/*
 * ③ 검색에서 궁금해하는 것(2026-10-07 사장님 "지식인 · 카페만 볼 게 아니라 실제 검색에서 사람들이 뭘 궁금해하는지").
 * 재료는 워커 keyword-expansions(자동완성 · 검색광고 연관어 + 실측 검색량). 사이트 postPlanSiteModel 과 같은 규칙(두 곳을 같이 고칠 것).
 */
const ROLE_PREFIXES = ['트로트가수', '개그우먼', '개그맨', '아나운서', '방송인', '여배우', '남배우', '유튜버', '아이돌', '배우', '가수', '모델', '감독', '작가', '선수'];
const INTENT_SUFFIXES = ['사망원인', '나무위키', '총정리', '프로필', '이유', '원인', '나이', '근황', '남편', '아내', '부인', '학력', '재산', '결혼', '이혼', '사망', '별세', '부고', '장례',
  '방법', '신청', '기간', '조건', '대상', '자격', '후기', '가격', '추천', '순위', '일정', '시간', '예매', '차이', '종류', '비교', '정리'];

/**
 * 띄어쓰기 없는 긴 키워드에 흔한 앞말(직업) · 뒷말(의도) 자리 띄어쓰기를 넣는다 — 띄어쓰기가 없으면 확장이 0개라서(실측).
 * '가수주현미별세이유' → '가수 주현미 별세 이유'. 이미 띄어 썼거나 떼어 낼 말이 없으면 null. 가운데(핵심) 말은 2자 이상 남긴다.
 */
export function spaceOutKeyword(keyword: string): string | null {
  const raw = String(keyword || '').trim();
  if (!raw || /\s/.test(raw) || raw.length < 5) return null;
  let core = raw;
  const head: string[] = [];
  const tail: string[] = [];
  const prefix = ROLE_PREFIXES.find((p) => core.startsWith(p) && core.length - p.length >= 2);
  if (prefix) { head.push(prefix); core = core.slice(prefix.length); }
  for (let guard = 0; guard < 4; guard += 1) {
    const suffix = INTENT_SUFFIXES.find((s) => core.endsWith(s) && core.length - s.length >= 2);
    if (!suffix) break;
    tail.unshift(suffix);
    core = core.slice(0, -suffix.length);
  }
  if (!head.length && !tail.length) return null;
  return [...head, core, ...tail].join(' ');
}

/**
 * 확장이 0개일 때 다시 찾을 말(순서대로) — 직업 앞말은 뗀 것 먼저('주현미 별세 이유'), 그다음 띄운 말 그대로.
 * '가수'를 붙인 채 찾으면 확장이 가수 일반으로 번져 3개뿐이었다 → 떼면 10개(2026-10-07 실측). 띄울 게 없으면 빈 목록.
 */
export function expansionRetryQueries(keyword: string): string[] {
  const spaced = spaceOutKeyword(keyword);
  if (!spaced) return [];
  const words = spaced.split(' ');
  const noRole = ROLE_PREFIXES.includes(words[0]) && words.length >= 3 ? words.slice(1).join(' ') : spaced;
  return [...new Set([noRole, spaced])];
}

/** 두 말(띄어쓰기 뺀)이 함께 가진 가장 긴 연속 글자 수. */
function longestShared(a: string, b: string): number {
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const keep = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = keep;
    }
  }
  return best;
}

/**
 * 검색에서 궁금해하는 말 — 키워드와 3자 이상 겹치는 말만(2자짜리 '가수' · '보험' 하나만 겹치는 엉뚱한 말 제외),
 * 키워드 낱말이 많이 든 순 → 같으면 검색량 순(못 잰 값은 뒤, null 그대로). 자기 자신 · 번진 말 제외.
 */
export function searchCuriosities(keyword: string, items: ReadonlyArray<{ keyword: string; searchVolume?: number | null; drifted?: boolean }>, limit: number): Array<{ keyword: string; searchVolume: number | null }> {
  const compactOf = (s: string) => String(s || '').replace(/\s+/g, '');
  const self = compactOf(keyword);
  const words = String(spaceOutKeyword(keyword) || keyword).split(/\s+/).filter((w) => w.length >= 2);
  const seen = new Set<string>();
  const rows: Array<{ keyword: string; searchVolume: number | null; score: number }> = [];
  for (const item of items || []) {
    if (!item || !item.keyword || item.drifted) continue;
    const c = compactOf(item.keyword);
    if (!c || c === self || seen.has(c) || longestShared(c, self) < 3) continue;
    seen.add(c);
    const volume = typeof item.searchVolume === 'number' && Number.isFinite(item.searchVolume) ? item.searchVolume : null;
    rows.push({ keyword: item.keyword, searchVolume: volume, score: words.filter((w) => c.includes(w)).length });
  }
  return rows
    .sort((a, b) => b.score - a.score || (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
    .slice(0, limit)
    .map(({ keyword: k, searchVolume }) => ({ keyword: k, searchVolume }));
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

/**
 * 사이트 동기화용 설계 요약(2026-10-06 4차) — 사이트가 비밀번호 유도 키로 잠가 계정에 올린다(상한 64KB).
 * 최근 20개 · 화면에 그릴 값만. 답변 초안 본문 · 1페이지 상위 제목 · 뉴스 같은 큰 칸은 뺀다(초안은 개수만).
 */
export function planSyncView(plans: readonly PostPlan[]): Array<Record<string, unknown>> {
  return plans.slice(0, 20).map((plan) => {
    const j: any = plan.steps.judge?.data || null;
    const t: any = plan.steps.titles?.data || null;
    const f: any = plan.steps.inflow?.data || null;
    const r: any = plan.steps.result?.data || null;
    const spot = (s: any) => ({ title: s.title, link: s.link, where: s.where, postdate: s.postdate, action: s.action, reason: s.reason });
    return {
      id: plan.id,
      keyword: plan.keyword,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      judge: j ? {
        searchVolume: j.searchVolume ?? null, documentCount: j.documentCount ?? null,
        seat: j.seat?.verdict ?? null, facing: j.seat?.facing ?? null, vacancy: j.seat?.vacancy ?? null,
        range: j.range?.verdict ?? null, rangeReason: j.range?.reason ?? '',
      } : null,
      titles: t ? { search: (t.search || []).map((x: any) => x.text).slice(0, 3), homefeed: (t.homefeed || []).slice(0, 3) } : null,
      inflow: f ? {
        postUrl: f.postUrl, postTitle: f.postTitle, found: f.found ?? 0, relevant: f.relevant ?? 0, skipped: f.skipped ?? 0,
        spots: (f.spots || []).slice(0, 10).map(spot),
        answered: Object.keys(f.answers || {}).length,
      } : null,
      result: r ? { registeredAt: r.registeredAt, pick: r.pick, checks: r.checks || [], latest: r.latest || null, homefeed: r.homefeed || null } : null,
    };
  });
}

/**
 * 제목 재료 연관어 — 키워드 낱말(2자 이상) 절반 이상을 담은 것만, 검색량 큰 순 20개(키워드 자신 제외).
 * 연관어 확장은 엉뚱하게 번진 말('현대차' 665,800)까지 줘서 제목에 섞였다(2026-10-06 실주행). 사이트 postPlanSiteModel 과 같은 규칙.
 */
export function relatedForTitles(keyword: string, items: ReadonlyArray<{ keyword: string; volume: number | null }>): Array<{ keyword: string; searchVolume: number }> {
  const compactOf = (s: string) => String(s || '').replace(/\s+/g, '');
  const self = compactOf(keyword);
  const words = String(keyword || '').split(/\s+/).filter((w) => w.length >= 2);
  const rows: Array<{ keyword: string; searchVolume: number }> = [];
  for (const item of items || []) {
    const volume = item && item.volume;
    if (typeof volume !== 'number' || volume <= 0) continue;
    const c = compactOf(item.keyword);
    if (c === self) continue;
    if (words.length > 0 && words.filter((w) => c.includes(w)).length * 2 < words.length) continue;
    rows.push({ keyword: item.keyword, searchVolume: volume });
  }
  return rows.sort((a, b) => b.searchVolume - a.searchVolume).slice(0, 20);
}
