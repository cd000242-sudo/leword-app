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
  steps: Partial<Record<'judge' | 'titles' | 'questions' | 'money', PostPlanStep<unknown>>>;
}

interface RadarLikeItem {
  source?: string;
  title?: string;
  link?: string;
  postdate?: string;
  postedAt?: string;
  cafeName?: string;
  siteName?: string;
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
