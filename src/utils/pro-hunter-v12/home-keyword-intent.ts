export interface HomeNeedKeyword {
  keyword: string;
  category?: string;
  score: number;
}

const GENERIC_HEADS = [
  '추천', '순위', '가격', '후기', '뜻', '날씨', '뉴스', '이슈', '바로가기', '링크',
];

const PERSONA_TOKENS = [
  '직장인', '주부', '초보', '입문', '부모님', '아이', '가족', '1인 가구', '신혼',
  '30대', '40대', '50대', '60대', '소상공인', '자영업자', '청년', '학생', '시니어',
];

const ACTION_TOKENS = [
  '신청', '대상', '조건', '서류', '지급일', '사용처', '변경', '바뀐', '마감',
  '체크리스트', '준비물', '비교', '정리', '방법', '주의사항', '실수', '후기',
  '코스', '일정', '비용', '할인', '환급', '계산', '조회',
];

const JUNE_TOKENS = [
  '6월', '초여름', '여름', '장마', '장마철', '제습', '냉방', '에어컨', '선풍기',
  '모기', '휴가', '여름휴가', '여름방학', '상반기', '호국보훈', '현충일', '복날',
];

const CATEGORY_SUFFIXES: Record<string, string[]> = {
  policy: ['2026 6월 신청 조건', '지급일과 준비서류', '대상 조회 방법', '놓치기 쉬운 변경사항'],
  finance: ['상반기 점검 체크리스트', '6월 바뀐 조건', '환급·공제 확인할 것', '초보가 놓치는 주의사항'],
  health: ['초여름 관리 방법', '장마철 주의사항', '직장인 체크리스트', '증상별 비교 정리'],
  living: ['장마철 체크리스트', '제습·냄새 해결 방법', '다이소 활용 정리', '초여름 준비물'],
  interior: ['장마철 관리 방법', '원룸 체크리스트', '셀프 비용 정리', '초여름 바뀌는 관리법'],
  travel: ['6월 주말 코스', '장마철 대체 일정', '여름휴가 준비물', '비 오면 갈만한 곳'],
  parenting: ['여름방학 준비 체크리스트', '장마철 실내놀이', '아이 건강 주의사항', '준비물 비용 정리'],
  food: ['초여름 메뉴 5가지', '장마철 집밥 정리', '직장인 도시락 체크리스트', '제철 재료 활용법'],
  beauty: ['초여름 지속력 비교', '장마철 무너짐 방지', '민감성 체크리스트', '2026 여름 바뀐 트렌드'],
  fashion: ['장마철 코디 방법', '초여름 출근룩 정리', '비 오는 날 신발 비교', '6월 하객룩 체크'],
  it: ['2026 설정 체크리스트', '장마철 기기 관리', '가성비 비교 정리', '업데이트 후 바뀐 점'],
  celebrity: ['이번 주 이슈 정리', '방송 전 알아둘 포인트', '팬들이 찾는 일정 정리', '관련 상품 체크리스트'],
  issue: ['이번 주 확인할 것', '6월 바뀐 점 정리', '생활에 영향 있는 포인트', '오늘 글감 체크리스트'],
  general: ['6월 지금 확인할 것', '초여름 체크리스트', '놓치기 쉬운 변경사항', '오늘 쓰기 좋은 정리'],
};

function compact(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizedCategory(category?: string): string {
  const c = String(category || '').toLowerCase();
  if (c === 'home_life') return 'living';
  if (c === 'career' || c === 'business' || c === 'sidejob') return 'finance';
  if (c === 'camping') return 'travel';
  if (c === 'recipe') return 'food';
  if (c === 'entertainment' || c === 'music' || c === 'book' || c === 'game') return 'celebrity';
  return c || 'general';
}

export function scoreHomeNeedKeyword(keyword: string, category = 'general', now = new Date()): number {
  const kw = compact(keyword);
  if (!kw) return 0;

  const tokens = kw.split(/\s+/).filter(Boolean);
  let score = 22;

  const month = now.getMonth() + 1;
  const currentMonthPattern = new RegExp(`${month}월|2026|최신|이번\\s*주|오늘|지금|마감|변경|바뀐`);
  if (currentMonthPattern.test(kw)) score += 18;
  if (month === 6 && JUNE_TOKENS.some(t => kw.includes(t))) score += 22;
  if (ACTION_TOKENS.some(t => kw.includes(t))) score += 22;
  if (PERSONA_TOKENS.some(t => kw.includes(t))) score += 14;
  if (/\d+\s*(개|가지|만원|원|일|주|월|박|시간|%)|TOP\s*\d+/i.test(kw)) score += 10;
  if (kw.length >= 10 && kw.length <= 34) score += 10;
  if (tokens.length >= 4) score += 10;

  const cat = normalizedCategory(category);
  if (cat !== 'general' && CATEGORY_SUFFIXES[cat]) score += 5;

  const hasOnlyGenericIntent = tokens.length <= 2 || (tokens.length <= 3 && GENERIC_HEADS.some(t => kw.endsWith(t)));
  if (hasOnlyGenericIntent && !ACTION_TOKENS.some(t => kw.includes(t)) && !JUNE_TOKENS.some(t => kw.includes(t))) score -= 35;
  if (/^(오늘\s*)?(이슈|뉴스|실시간|추천|가격|날씨)$/.test(kw)) score -= 50;
  if (/(주식\s*추천|코인|도박|성폭|살인|자살|화재|폭발)/.test(kw)) score -= 60;

  return Math.max(0, Math.min(100, score));
}

export function isWeakHomeNeedKeyword(keyword: string, category = 'general'): boolean {
  return scoreHomeNeedKeyword(keyword, category) < 45;
}

export function expandHomeNeedKeywords(seed: string, category = 'general', limit = 8): HomeNeedKeyword[] {
  const base = compact(seed);
  if (!base) return [];
  const cat = normalizedCategory(category);
  const suffixes = CATEGORY_SUFFIXES[cat] || CATEGORY_SUFFIXES.general;
  const candidates = new Set<string>();

  if (!isWeakHomeNeedKeyword(base, cat)) candidates.add(base);
  for (const suffix of suffixes) {
    if (base.includes(suffix)) candidates.add(base);
    else candidates.add(`${base} ${suffix}`);
  }
  candidates.add(`2026 6월 ${base} 체크리스트`);
  candidates.add(`${base} 지금 확인할 변경사항`);

  return Array.from(candidates)
    .map(keyword => ({ keyword, category: cat, score: scoreHomeNeedKeyword(keyword, cat) }))
    .filter(item => item.score >= 45)
    .sort((a, b) => b.score - a.score || a.keyword.length - b.keyword.length)
    .slice(0, limit);
}

export function rankHomeNeedKeywords<T extends { keyword: string; category?: string }>(
  items: T[],
): Array<T & { homeNeedScore: number }> {
  const seen = new Set<string>();
  const out: Array<T & { homeNeedScore: number }> = [];
  for (const item of items || []) {
    const keyword = compact(item.keyword);
    const key = keyword.toLowerCase().replace(/\s+/g, '');
    if (!keyword || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, keyword, homeNeedScore: scoreHomeNeedKeyword(keyword, item.category) });
  }
  return out.sort((a, b) => b.homeNeedScore - a.homeNeedScore || a.keyword.length - b.keyword.length);
}
