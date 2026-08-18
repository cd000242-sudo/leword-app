/**
 * 니즈 검색어 도출 — 제휴 상품의 "사람들이 실제로 치는 검색어"를 상품명에서 뽑는다.
 *
 * 왜: 상품명 검색어는 월 검색량이 0~140 이라(2026-08-19 실측) 자리가 비어 있어도
 * 유입이 없다. 성과는 니즈 검색어(예: "드리미 로봇청소기" 24,940 · "휴대용 선풍기"
 * 65,100)로 들어가 상품을 답으로 팔 때 난다. 여기서는 **후보만** 만든다 —
 * 어느 후보가 진짜 수요인지는 호출측이 검색광고 실측으로 고른다(실존결재).
 *
 * 건당 수익은 수수료율이 데이터에 있을 때만 단순 산술(가격 × 요율)로 낸다.
 * 요율이 없으면 만들지 않는다 — 추정치를 화면에 올리지 않는 것이 이 앱의 규칙이다.
 */

/** 색상·옵션·수량·이벤트 등 카테고리가 될 수 없는 꼬리 토큰 (2026-08-19 실물 17건 실측) */
const TRAILING_NOISE = new Set([
  '화이트', '블랙', '베이지', '그레이', '핑크', '블루', '레드', '바이올렛', '아이보리',
  '특품', '본품', '중형', '대형', '소형', '세트', '옵션',
  '선물', '증정', '단품', '특가', '기획', '구성', '모음', '음쓰',
]);

/**
 * 제품 카테고리 접미 — 상품명 어디에 있든 이 접미로 끝나는 토큰은 카테고리다.
 * 마지막 토큰만 믿으면 시리즈명("빈다르 플로우")·용도문구("부모님 선물")에 속는다
 * (실측: 니즈가 '플로우'·'선물'로 나간 사고). '-기'류가 한국어 기기명의 뼈대다.
 */
const CATEGORY_SUFFIX = /(청소기|세정기|처리기|선풍기|손풍기|드라이기|가습기|건조기|분쇄기|공기청정기|제습기|정수기|주전자|포트|써큘레이터|에어컨|생리대|티슈|매트|국수|완자|갈비|북채|복숭아|거봉|동치미|김|즙|환|차|분말)$/;

/** 카테고리 명사와 강결합인 앞 수식어 — 함께 붙여야 검색어가 된다 */
const CATEGORY_MODIFIERS = new Set([
  '휴대용', '무선', '가정용', '미니', '손', '스탠드', '탁상용', '차량용', '올인원', '접이식',
]);

/** 먹는 소모품 접미 — "효능" 니즈가 실제로 붙는 카테고리 (양배추즙 효능 5,510 실측) */
const CONSUMABLE_SUFFIX = /(즙|환|차|분말|젤리|영양제|유산균|오일)$/;

function stripOptions(name: string): string {
  return String(name || '')
    .replace(/\[[^\]]*\]/g, ' ')     // [여름특가] 류
    .replace(/,.*$/, ' ')            // ", 1kg, 1개" 류 옵션 꼬리
    .replace(/[+/·]/g, ' ')          // "로봇청소기+악세사리" 류 연결 기호는 토큰 경계다
    .replace(/\s+/g, ' ')
    .trim();
}

function withModifier(tokens: string[], index: number): string {
  const head = tokens[index];
  const before = index >= 1 ? tokens[index - 1] : '';
  return CATEGORY_MODIFIERS.has(before) ? `${before} ${head}` : head;
}

/**
 * 상품명 → 카테고리 구(句) 전부 (등장 순).
 * ① 접미 매칭 토큰이 주력 — 상품명 어디에 있어도 잡는다.
 * ② 하나도 없으면 마지막 유효 토큰 폴백 (식품류 등 접미 사전 밖 커버).
 */
export function extractCategoryPhrases(name: string): string[] {
  const tokens = stripOptions(name).split(/\s+/).filter(Boolean);
  const phrases: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    if (!CATEGORY_SUFFIX.test(tokens[i]) || !/[가-힣]{2,}/.test(tokens[i])) continue;
    // 결합형("올인원 로봇청소기")과 단독형("로봇청소기") 둘 다 — 어느 쪽이 진짜
    // 수요인지는 실측이 고른다 (결합형만 내면 220 이 24,940 을 가리는 실사고).
    for (const phrase of [withModifier(tokens, i), tokens[i]]) {
      const key = phrase.replace(/\s+/g, '');
      if (!seen.has(key)) { seen.add(key); phrases.push(phrase); }
    }
  }
  if (phrases.length > 0) return phrases;

  const trimmed = [...tokens];
  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    if (TRAILING_NOISE.has(last) || /^[0-9]/.test(last) || /^[A-Za-z0-9-]+$/.test(last)) {
      trimmed.pop();
      continue;
    }
    break;
  }
  if (trimmed.length === 0) return [];
  const head = trimmed[trimmed.length - 1];
  if (!/[가-힣]{2,}/.test(head)) return [];
  return [withModifier(trimmed, trimmed.length - 1)];
}

/** 하위호환 — 첫 카테고리 하나. 못 찾으면 '' */
export function extractCategoryPhrase(name: string): string {
  return extractCategoryPhrases(name)[0] || '';
}

/**
 * 니즈 검색어 후보 (최대 4, 실측으로 골라낼 원료).
 * 순서는 기대 수요 순 가설일 뿐 — 진짜 순위는 검색광고 실측이 정한다.
 */
export function deriveNeedKeywordCandidates(name: string, brand?: string): string[] {
  const categories = extractCategoryPhrases(name);
  if (categories.length === 0) return [];
  const cleanBrand = String(brand || '').trim();
  const candidates: string[] = [];
  for (const category of categories.slice(0, 3)) {
    candidates.push(
      `${category} 추천`,
      cleanBrand && !category.includes(cleanBrand) ? `${cleanBrand} ${category}` : '',
      category,
      CONSUMABLE_SUFFIX.test(category.replace(/\s+/g, '')) ? `${category} 효능` : '',
    );
  }
  const seen = new Set<string>();
  return candidates.filter((keyword) => {
    const trimmed = keyword.trim();
    if (!trimmed || trimmed.length > 15) return false; // 15자 초과는 검색광고가 잘라 오답을 준다
    const key = trimmed.replace(/\s+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

/** "수수료 8%" → 0.08. 할인율("47% 할인")은 내 수익이 아니다 — null. */
export function parseCommissionRate(reward: string): number | null {
  const m = String(reward || '').match(/수수료\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (!m) return null;
  const rate = Number(m[1]) / 100;
  return rate > 0 && rate <= 1 ? rate : null;
}

/** 건당 수익(원) — 가격 × 요율 단순 산술. 재료가 없으면 만들지 않는다. */
export function perSaleCommission(price: number | null | undefined, reward: string): number | null {
  const rate = parseCommissionRate(reward);
  if (rate === null || typeof price !== 'number' || price <= 0) return null;
  return Math.round(price * rate);
}
