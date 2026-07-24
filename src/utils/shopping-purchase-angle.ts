/**
 * 🛒 구매·사용 욕구 자극 문구 생성기 (결정론적, 비용 0)
 *
 * 목적: 쇼핑 커넥트가 발굴한 상품을 "왜 사는가 / 어떻게 쓰는가" 관점으로 풀어
 *       쇼츠·블로그에서 바로 쓸 수 있는 후킹 문구를 만든다.
 *
 * 원칙:
 *   - 계절은 달력이 아니라 "상품 자체 신호"(제습기=장마, 선풍기=여름)에서만 도출.
 *     달력 기반 계절 추론은 "한겨울이니 눈 온다" 식 뻔한 문구가 되어 금지.
 *   - 추정치(예상 트래픽/수익)는 문구에 넣지 않는다 — 실측·상품속성·사용 시나리오만.
 *   - 순수 함수 + 불변. 외부 호출 없음.
 */

export type PurchaseAngleKind = '구매욕구' | '사용욕구' | '신뢰';

export interface PurchaseAngle {
  text: string;
  kind: PurchaseAngleKind;
  basis: string; // 이 문구가 나온 근거 (카테고리/가격/리뷰/계절 신호)
}

export interface PurchaseAngleInput {
  title?: string;
  cleanTitle?: string;
  simplifiedTitle?: string;
  brand?: string;
  maker?: string;
  category1?: string;
  category2?: string;
  category3?: string;
  lprice?: number;
  reviewCount?: number;
  rating?: number;
}

interface DomainAngle {
  id: string;
  match: RegExp;
  buy: (noun: string) => string;
  use: (noun: string) => string;
  basis: string;
}

// 카테고리/상품명 신호 → 도메인별 구매/사용 욕구 프레임.
// 위에서부터 먼저 매칭되는 하나를 채택 (구체적인 것부터 배치).
const DOMAIN_ANGLES: readonly DomainAngle[] = [
  {
    id: 'baby',
    match: /(출산|육아|기저귀|유아|아기|이유식|분유|젖병|카시트|유모차|아동)/,
    buy: (n) => `우리 아이에게 ${n}, 안 챙기면 나중에 더 신경 쓰이는 이유`,
    use: (n) => `이 시기 아이에게 ${n} 이렇게 써야 안전하고 편해요`,
    basis: '출산/육아 — 안전·불안 해소 동기',
  },
  {
    id: 'beauty',
    match: /(화장품|미용|스킨|로션|에센스|세럼|앰플|선크림|클렌징|마스크팩|뷰티|헤어|고데기|드라이어|향수|네일)/,
    buy: (n) => `거울 볼 때마다 신경 쓰이던 그 부분, ${n} 하나로 관리 시작`,
    use: (n) => `아침 세안 후 30초, ${n} 이렇게 써야 효과가 다릅니다`,
    basis: '화장품/미용 — 외모·자기관리 동기',
  },
  {
    id: 'health',
    // '생활/건강' 카테고리 라벨이 health 도메인을 가로채지 않도록 bare '건강' 제외.
    match: /(건강식품|건강기능|영양제|비타민|유산균|홍삼|프로틴|보조식품|다이어트|콜라겐|오메가)/,
    buy: (n) => `요즘 부쩍 피곤하다면 — ${n} 하나쯤 챙겨야 할 때`,
    use: (n) => `${n}, 공복보다 이 타이밍에 먹어야 흡수가 좋아요`,
    basis: '건강식품 — 건강 불안·관리 동기',
  },
  {
    id: 'kitchen',
    match: /(주방|조리|냄비|프라이팬|에어프라이어|믹서|밀폐용기|도마|칼|텀블러|커피|식기)/,
    buy: (n) => `매번 번거롭던 그 순간, ${n} 하나면 정리됩니다`,
    use: (n) => `${n} 이렇게 쓰면 요리 시간이 확 줄어요`,
    basis: '주방 — 시간 절약·편의 동기',
  },
  {
    id: 'clean',
    match: /(청소|세제|물티슈|정리|수납|욕실|주방세제|청소기|걸레|먼지|살균|탈취)/,
    buy: (n) => `귀찮아서 미뤄둔 청소, ${n} 하나면 5분이면 끝`,
    use: (n) => `${n}, 이 부분부터 쓰면 티 나게 깨끗해집니다`,
    basis: '생활/청소 — 귀찮음 해소 동기',
  },
  {
    id: 'summer',
    match: /(선풍기|서큐레이터|냉풍기|쿨매트|아이스|제습기|에어컨|쿨링|냉감|휴대용선풍기|넥밴드)/,
    buy: (n) => `더위 오기 전에 ${n} 미리 — 한여름엔 품절부터 걱정`,
    use: (n) => `${n}, 이렇게 두고 쓰면 체감 온도가 다릅니다`,
    basis: '여름 계절가전 — 상품 자체 계절 신호',
  },
  {
    id: 'winter',
    match: /(히터|난방|온풍기|전기요|전기장판|손난로|방한|보온|기모|패딩|가습기)/,
    buy: (n) => `추워지기 전에 ${n} — 한파 오면 다들 찾습니다`,
    use: (n) => `${n}, 이 위치에 두면 따뜻함이 오래 갑니다`,
    basis: '겨울 계절가전 — 상품 자체 계절 신호',
  },
  {
    id: 'pet',
    match: /(반려|강아지|고양이|사료|펫|애견|캣|배변|하네스)/,
    buy: (n) => `우리 아이(반려동물)한테 ${n}, 미리 챙겨두면 마음 편해요`,
    use: (n) => `${n} 이렇게 적응시키면 거부감 없이 잘 씁니다`,
    basis: '반려동물 — 케어·불안 해소 동기',
  },
  {
    id: 'sports',
    match: /(스포츠|레저|캠핑|등산|낚시|자전거|요가|헬스|골프|러닝|텐트|아웃도어)/,
    buy: (n) => `이번 시즌 제대로 즐기려면 ${n} 하나는 챙겨야죠`,
    use: (n) => `${n}, 이렇게 챙겨 가면 현장에서 후회 없습니다`,
    basis: '스포츠/레저 — 경험·준비 동기',
  },
  {
    id: 'digital',
    match: /(디지털|가전|이어폰|충전기|보조배터리|케이블|블루투스|스마트|노트북|모니터|마우스|키보드)/,
    buy: (n) => `매번 아쉬웠던 그 불편, ${n} 하나로 해결`,
    use: (n) => `이 기능만 알면 ${n} 제대로 활용합니다`,
    basis: '디지털/가전 — 편의·불편 해소 동기',
  },
  {
    id: 'fashion',
    match: /(의류|패션|잡화|가방|신발|셔츠|바지|원피스|모자|양말|악세|주얼리|시계|지갑)/,
    buy: (n) => `${n} 하나로 코디 고민이 줄어듭니다`,
    use: (n) => `${n}, 이렇게 매치하면 포인트가 살아요`,
    basis: '패션 — 스타일·자신감 동기',
  },
  {
    id: 'furniture',
    match: /(가구|인테리어|수납장|선반|의자|책상|조명|커튼|러그|매트리스|침대)/,
    buy: (n) => `공간이 아쉬웠다면 ${n}부터 바꿔보세요 — 분위기가 달라집니다`,
    use: (n) => `${n}, 이 자리에 두면 공간이 넓어 보입니다`,
    basis: '가구/인테리어 — 공간·만족 동기',
  },
];

const GENERIC_ANGLE: DomainAngle = {
  id: 'generic',
  match: /.*/,
  buy: (n) => `사놓고 "이걸 왜 이제 샀지" 싶은 ${n}`,
  use: (n) => `${n}, 이렇게 쓰면 만족도가 올라갑니다`,
  basis: '일반 — 후회 없는 구매 프레임',
};

function pickDomain(signalText: string): DomainAngle {
  for (const d of DOMAIN_ANGLES) {
    if (d.match.test(signalText)) return d;
  }
  return GENERIC_ANGLE;
}

/**
 * 상품의 "부를 이름" — 문구에 넣을 간결한 상품 명사.
 * 세부 카테고리 → 간소화 제목 → 정제 제목 순, 없으면 검색어.
 */
function pickProductNoun(input: PurchaseAngleInput, keyword: string): string {
  const candidates = [
    input.category3,
    input.category2,
    input.simplifiedTitle,
    input.cleanTitle,
    keyword,
    input.title,
  ];
  for (const c of candidates) {
    const s = String(c || '').replace(/\s+/g, ' ').trim();
    if (s && s.length >= 2 && s.length <= 20) return s;
  }
  const fallback = String(keyword || input.title || '이 상품').replace(/\s+/g, ' ').trim();
  return fallback.length > 20 ? fallback.slice(0, 20) : fallback || '이 상품';
}

function priceFraming(lprice: number, noun: string): { text: string; basis: string } | null {
  if (!lprice || lprice <= 0) return null;
  if (lprice < 20000) {
    return { text: `${lprice.toLocaleString()}원대 — 부담 없이 하나 들여 시작하기 좋은 가격`, basis: `가격 ${lprice.toLocaleString()}원 (저가 진입장벽 낮음)` };
  }
  if (lprice <= 80000) {
    return { text: `${lprice.toLocaleString()}원대 — 가성비로 만족도 높은 구간의 ${noun}`, basis: `가격 ${lprice.toLocaleString()}원 (가성비 구간)` };
  }
  return { text: `${lprice.toLocaleString()}원 — 제대로 된 것 하나로 오래 쓰는 선택`, basis: `가격 ${lprice.toLocaleString()}원 (프리미엄 — 오래 쓰는 가치 강조)` };
}

function trustFraming(reviewCount: number, rating: number, noun: string): { text: string; basis: string } | null {
  const rc = Number(reviewCount || 0);
  const rt = Number(rating || 0);
  if (rc >= 1000) {
    return { text: `리뷰 ${rc.toLocaleString()}개가 이미 검증한 ${noun}`, basis: `리뷰 ${rc.toLocaleString()}개 (대량 사회적 증거)` };
  }
  if (rc >= 100) {
    return { text: `이미 ${rc.toLocaleString()}명 이상이 선택한 ${noun}`, basis: `리뷰 ${rc.toLocaleString()}개 (사회적 증거)` };
  }
  if (rt >= 4.5 && rc >= 10) {
    return { text: `평점 ${rt.toFixed(1)}점, 써본 사람들이 만족한 ${noun}`, basis: `평점 ${rt.toFixed(1)} · 리뷰 ${rc}개` };
  }
  return null;
}

/**
 * 상품 → 구매·사용 욕구 자극 문구 (최대 3개, 중복 제거).
 * 순서: 구매욕구 → 사용욕구 → (신뢰 또는 가격) 보강.
 */
export function buildPurchaseDesireAngles(input: PurchaseAngleInput, keyword: string = ''): PurchaseAngle[] {
  const noun = pickProductNoun(input, keyword);
  const signalText = [
    input.category1, input.category2, input.category3,
    input.title, input.brand, input.maker,
  ].filter(Boolean).join(' ');
  const domain = pickDomain(signalText);

  const angles: PurchaseAngle[] = [
    { text: domain.buy(noun), kind: '구매욕구', basis: domain.basis },
    { text: domain.use(noun), kind: '사용욕구', basis: domain.basis },
  ];

  // 3번째 슬롯: 신뢰(리뷰) 신호가 있으면 우선, 없으면 가격 프레이밍.
  const trust = trustFraming(input.reviewCount || 0, input.rating || 0, noun);
  if (trust) {
    angles.push({ text: trust.text, kind: '신뢰', basis: trust.basis });
  } else {
    const price = priceFraming(input.lprice || 0, noun);
    if (price) angles.push({ text: price.text, kind: '구매욕구', basis: price.basis });
  }

  // 중복 텍스트 제거
  const seen = new Set<string>();
  return angles.filter((a) => {
    const k = a.text.trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 3);
}

/**
 * AI 강화용 프롬프트 빌더 — 규칙 문구를 시드로 주고 Claude가 더 자연스럽게 다듬게 한다.
 * (핸들러의 shopping-connect-ai-angle 채널에서 사용)
 */
export function buildAiAnglePrompt(input: PurchaseAngleInput, keyword: string, ruleAngles: PurchaseAngle[]): string {
  const noun = pickProductNoun(input, keyword);
  const cat = [input.category1, input.category2, input.category3].filter(Boolean).join(' > ');
  const seed = ruleAngles.map((a) => `- (${a.kind}) ${a.text}`).join('\n');
  return [
    `너는 쇼츠·블로그로 상품을 판매하는 카피라이터다.`,
    `아래 상품에 대해 "왜 사는가(구매욕구)"와 "어떻게 쓰는가(사용욕구)"를 자극하는 짧은 후킹 문구를 만들어라.`,
    ``,
    `상품명: ${input.cleanTitle || input.title || noun}`,
    cat ? `카테고리: ${cat}` : '',
    input.lprice ? `가격: ${input.lprice.toLocaleString()}원` : '',
    input.reviewCount ? `리뷰수: ${input.reviewCount.toLocaleString()}개` : '',
    keyword ? `검색 키워드: ${keyword}` : '',
    ``,
    `규칙 기반 초안(참고용, 더 자연스럽게 개선):`,
    seed,
    ``,
    `요구사항:`,
    `- 각 문구는 25자 이내, 클릭·구매를 부르는 톤.`,
    `- 과장/허위광고 표현 금지(최고, 100%, 무조건 등 금지). 실제 상품 속성에 근거.`,
    `- 예상 수익/트래픽 같은 추정 수치 넣지 말 것.`,
    `- 정확히 JSON 배열로만 출력: [{"text":"...","kind":"구매욕구"},{"text":"...","kind":"사용욕구"},{"text":"...","kind":"신뢰"}]`,
  ].filter(Boolean).join('\n');
}
