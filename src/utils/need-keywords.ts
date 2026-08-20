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
  /*
   * 브랜드 두 갈래 — 상품명 첫 한글 토큰이 먼저다. 데이터의 brand 필드가
   * 영문('Dreame')이라 "Dreame 로봇청소기"(410)를 고르고 한글 "드리미
   * 로봇청소기"(24,940)를 놓친 실사고. 한국에서 구매 검색은 한글 브랜드다.
   */
  const cleanBrand = String(brand || '').trim();
  const firstToken = stripOptions(name).split(/\s+/)[0] || '';
  const nameBrand = /^[가-힣]{2,}$/.test(firstToken) && !CATEGORY_MODIFIERS.has(firstToken)
    && !CATEGORY_SUFFIX.test(firstToken) ? firstToken : '';
  const brands = [...new Set([nameBrand, cleanBrand].filter(Boolean))];
  const candidates: string[] = [];
  /*
   * 순서가 곧 구매 의도 순위다 (pickNeedKeyword 가 이 순서를 우선한다):
   *   ① 브랜드+카테고리 — "드리미 로봇청소기"(24,940). 구매 직전 사람이 치는,
   *      말 그대로 **제품을 검색하는** 검색어. 노출 가능성·전환 최고.
   *   ② 추천형 — 비교·구매 검토 의도.
   *   ③ 카테고리 단독 — 수요는 최대지만("선풍기" 292,600) 초거대 헤드라
   *      상위노출이 불가능하고 의도도 얕다. 최후 폴백.
   */
  for (const category of categories.slice(0, 3)) {
    candidates.push(
      ...brands.map((b) => (category.includes(b) ? '' : `${b} ${category}`)),
      `${category} 추천`,
      CONSUMABLE_SUFFIX.test(category.replace(/\s+/g, '')) ? `${category} 효능` : '',
      category,
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

/**
 * 후보 → 최종 니즈 선택.
 *
 * 후보 순서(=구매 의도 순)를 우선하되, 수요 하한을 넘고 **글이 넘치지 않는**
 * 첫 후보를 고른다.
 *
 * 문서수를 보게 된 이유(사장님 지적 2026-08-20 "노출이 돼야 뭐가 팔리든
 * 말든 하니까"): 후보 ①번 브랜드+카테고리를 "노출 가능성 최고"로 적어 뒀는데
 * 재 본 적이 없었다. 실측하니 정반대였다 —
 *   드리미 로봇청소기  검색 24,940 / 문서 44,387  (검색보다 글이 1.8배)
 * 수요만 보고 1등에 올려 두면 아무도 못 쓰는 걸 맨 위에 놓는 셈이다.
 *
 * docsOf 를 안 주면 예전처럼 수요만 본다 — 문서수를 못 잰 경로가 있어서다.
 * 재지 못한 것을 "자리 있음"으로 치지는 않는다.
 */
export function pickNeedKeyword(
  candidates: string[],
  volumeOf: (keyword: string) => number | null | undefined,
  floor: number = 300,
  docsOf?: (keyword: string) => number | null | undefined,
  ratioFloor: number = 1
): { keyword: string; volume: number; docs: number | null; ratio: number | null } | null {
  const measure = (keyword: string, volume: number) => {
    const docs = docsOf ? docsOf(keyword) : undefined;
    const usable = typeof docs === 'number' && Number.isFinite(docs) ? docs : null;
    return {
      keyword,
      volume,
      docs: usable,
      ratio: usable === null ? null : Math.round((usable > 0 ? volume / usable : volume) * 10) / 10,
    };
  };

  let winnable: ReturnType<typeof measure> | null = null;
  let byIntent: ReturnType<typeof measure> | null = null;
  let biggestBelowFloor: ReturnType<typeof measure> | null = null;
  for (const candidate of candidates) {
    const volume = volumeOf(candidate) || 0;
    if (volume <= 0) continue;
    const row = measure(candidate, volume);
    if (volume >= floor) {
      // 의도 순서가 앞선 것이 이긴다 — 처음 걸린 것을 그대로 쓴다.
      if (!winnable && row.ratio !== null && row.ratio >= ratioFloor) winnable = row;
      if (!byIntent) byIntent = row;
      if (!docsOf) return row; // 문서수를 못 재는 경로는 예전 규칙 그대로
    } else if (!biggestBelowFloor || volume > biggestBelowFloor.volume) {
      biggestBelowFloor = row;
    }
  }
  /*
   * 자리가 있는 후보가 하나도 없으면 **예전 규칙으로 돌아간다**(의도 순서 첫 후보).
   * 여기서 "검색량 제일 큰 것"으로 폴백하면 정반대가 된다 — 실측:
   * 자리 없는 상품에서 "선풍기"(문서 3,140,066)가 1등으로 올라왔다.
   * 제일 안 되는 것을 제일 위에 놓는 셈이다.
   */
  return winnable || byIntent || biggestBelowFloor;
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
