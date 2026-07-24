/**
 * shopping-purchase-angle.test.ts
 *
 * 쇼핑 커넥트 재설계 검증:
 *   1) 구매·사용 욕구 자극 문구가 카테고리/가격/리뷰 신호에 맞게 나오는지
 *   2) 실측 황금비가 상품 랭킹의 1차 신호로 승격됐는지
 *      (저경쟁+고검색 상품이, 대리지표만 높은 상품보다 위로 온다)
 */

import {
  buildPurchaseDesireAngles,
  buildAiAnglePrompt,
  type PurchaseAngle,
} from '../shopping-purchase-angle';
import {
  bestMeasuredEntryKeyword,
  computeProductGoldenScore,
  computeProductRankScore,
  rankByProductGolden,
  scoreLeWordEntryKeyword,
  type ShoppingItem,
  type ShoppingLeWordKeyword,
} from '../naver-shopping-api';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(`✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function makeItem(partial: Partial<ShoppingItem>): ShoppingItem {
  return {
    title: '',
    link: 'https://example.com',
    image: '',
    lprice: 0,
    hprice: 0,
    mallName: '',
    productId: '',
    productType: 1,
    ...partial,
  };
}

function seed(kw: string, relation: ShoppingLeWordKeyword['relation'] = 'category'): ShoppingLeWordKeyword {
  return { keyword: kw, relation, reason: 'test', verdict: '데이터필요' };
}

// ────────────────────────────────────────────────────────────
// 1) 구매·사용 욕구 문구
// ────────────────────────────────────────────────────────────

// 카테고리 도메인 매칭 — 화장품/미용
{
  const angles = buildPurchaseDesireAngles(
    { title: '살롱드 고데기 32mm', category1: '화장품/미용', category3: '고데기', lprice: 29900, reviewCount: 320 },
    '고데기 추천'
  );
  assert('미용: 최대 3개 문구', angles.length >= 2 && angles.length <= 3, `len=${angles.length}`);
  assert('미용: 구매욕구 문구 존재', angles.some((a) => a.kind === '구매욕구'));
  assert('미용: 사용욕구 문구 존재', angles.some((a) => a.kind === '사용욕구'));
  assert('미용: 리뷰 320개 → 신뢰 문구', angles.some((a) => a.kind === '신뢰' && /320/.test(a.text)), JSON.stringify(angles));
  assert('미용: 문구에 상품 명사 주입', angles.some((a) => /고데기/.test(a.text)));
}

// 계절은 상품 신호에서만 — 제습기는 여름/장마 프레임
{
  const angles = buildPurchaseDesireAngles(
    { title: '위닉스 제습기 10L', category1: '디지털/가전', category3: '제습기', lprice: 189000 },
    '제습기'
  );
  assert('제습기: 여름 계절 프레임 채택', angles.some((a) => /여름|더위|한여름/.test(a.text)), JSON.stringify(angles.map((a) => a.text)));
  // 리뷰 없음 → 3번째 슬롯은 가격 프레이밍(프리미엄)
  assert('제습기: 리뷰 없으면 가격 프레임', angles.some((a) => /189,000원|오래 쓰는/.test(a.text)), JSON.stringify(angles.map((a) => a.text)));
}

// 저가 상품 → 저가 진입 프레임
{
  const angles = buildPurchaseDesireAngles(
    { title: '무선 충전 케이블', category1: '디지털/가전', category3: '케이블', lprice: 8900 },
    '충전 케이블'
  );
  assert('저가: 부담없는 가격 프레임', angles.some((a) => /부담 없이|8,900원/.test(a.text)), JSON.stringify(angles.map((a) => a.text)));
}

// 미지의 카테고리 → 일반 프레임이라도 문구 생성 (빈 배열 금지)
{
  const angles = buildPurchaseDesireAngles({ title: '정체불명 상품', lprice: 15000 }, '테스트');
  assert('일반: 문구 최소 2개 생성', angles.length >= 2, `len=${angles.length}`);
}

// 과장 표현 금지 확인 (규칙 문구에 '최고/100%/무조건' 없어야)
{
  const cases: PurchaseAngle[][] = [
    buildPurchaseDesireAngles({ title: '비타민', category1: '식품', category3: '영양제', lprice: 25000, reviewCount: 1500 }, '비타민'),
    buildPurchaseDesireAngles({ title: '강아지 사료', category1: '생활/건강', category3: '사료', lprice: 45000 }, '강아지 사료'),
  ];
  const allText = cases.flat().map((a) => a.text).join(' ');
  assert('과장 표현(최고/100%/무조건) 없음', !/최고|100%|무조건/.test(allText), allText);
}

// AI 프롬프트 빌더 — JSON 출력 지시 + 과장 금지 포함
{
  const rule = buildPurchaseDesireAngles({ title: '에어프라이어', category1: '디지털/가전', category3: '에어프라이어', lprice: 89000 }, '에어프라이어');
  const prompt = buildAiAnglePrompt({ title: '에어프라이어', category3: '에어프라이어', lprice: 89000 }, '에어프라이어', rule);
  assert('AI 프롬프트: JSON 배열 출력 지시', /JSON 배열/.test(prompt));
  assert('AI 프롬프트: 과장 금지 규칙 포함', /과장|허위/.test(prompt));
  assert('AI 프롬프트: 규칙 초안 시드 포함', /에어프라이어/.test(prompt));
}

// ────────────────────────────────────────────────────────────
// 2) 실측 황금비 → 상품 랭킹 1차 신호
// ────────────────────────────────────────────────────────────

// 저경쟁+고검색 진입어를 가진 상품 (검색량 8000 · 문서수 300 → 골든 높음)
const goldenItem = makeItem({
  title: '저경쟁 상품',
  productId: 'golden',
  opportunityScore: 55,        // 대리지표 판매성은 중간
  conversionScore: 20,
  lewordEntryKeywords: [
    scoreLeWordEntryKeyword(seed('여행용 무선 고데기'), 8000, 300),  // 진입가능
    scoreLeWordEntryKeyword(seed('고데기 추천'), 40000, 250000),     // 빅키워드
  ],
});

// 대리지표(기회점수)만 높고, 진입어는 빅키워드뿐인 상품
const hypeItem = makeItem({
  title: '핫하지만 경쟁 심한 상품',
  productId: 'hype',
  opportunityScore: 85,        // 대리지표 판매성은 최상
  conversionScore: 40,
  lewordEntryKeywords: [
    scoreLeWordEntryKeyword(seed('고데기'), 90000, 500000),          // 빅키워드주의
  ],
});

// 측정 안 된 상품 (골든 0)
const unmeasuredItem = makeItem({
  title: '측정 안된 상품',
  productId: 'unmeasured',
  opportunityScore: 70,
  conversionScore: 30,
  lewordEntryKeywords: [seed('무언가 키워드')], // sv/dc 없음 → 미측정
});

{
  const gGolden = computeProductGoldenScore(goldenItem);
  const gHype = computeProductGoldenScore(hypeItem);
  const gUnmeasured = computeProductGoldenScore(unmeasuredItem);
  assert('골든점수: 저경쟁 상품 > 빅키워드 상품', gGolden > gHype, `golden=${gGolden} hype=${gHype}`);
  assert('골든점수: 미측정 상품 = 0', gUnmeasured === 0, `unmeasured=${gUnmeasured}`);

  const best = bestMeasuredEntryKeyword(goldenItem);
  assert('최적 진입어 = 저경쟁 롱테일', !!best && best.keyword === '여행용 무선 고데기', best?.keyword);

  const ranked = rankByProductGolden([hypeItem, unmeasuredItem, goldenItem], 3);
  assert('재랭킹: 저경쟁+고검색 상품이 1위', ranked[0]?.productId === 'golden', ranked.map((r) => r.productId).join(','));
  assert('재랭킹: 미측정 상품은 최하위', ranked[ranked.length - 1]?.productId === 'unmeasured', ranked.map((r) => r.productId).join(','));
  assert('재랭킹: bestEntryKeyword 부착됨', !!ranked[0]?.bestEntryKeyword, JSON.stringify(ranked[0]?.bestEntryKeyword));
  assert('재랭킹: productRankScore 부착됨', typeof ranked[0]?.productRankScore === 'number');
}

// 골든이 동률이면 판매성(기회점수)이 tiebreak
{
  const a = makeItem({
    title: 'A', productId: 'A', opportunityScore: 40, conversionScore: 10,
    lewordEntryKeywords: [scoreLeWordEntryKeyword(seed('저경쟁어 A'), 5000, 400)],
  });
  const b = makeItem({
    title: 'B', productId: 'B', opportunityScore: 80, conversionScore: 30,
    lewordEntryKeywords: [scoreLeWordEntryKeyword(seed('저경쟁어 B'), 5000, 400)],
  });
  const ga = computeProductGoldenScore(a);
  const gb = computeProductGoldenScore(b);
  assert('동일 진입어 → 골든 동률', ga === gb, `ga=${ga} gb=${gb}`);
  const ranked = rankByProductGolden([a, b], 2);
  assert('골든 동률 시 판매성 높은 B가 위로', ranked[0]?.productId === 'B', ranked.map((r) => r.productId).join(','));
}

// 실측 데이터 전무 → 판매성 순으로 폴백 (네이버 키 없는 상황)
{
  const x = makeItem({ title: 'X', productId: 'X', opportunityScore: 30, lewordEntryKeywords: [seed('kw')] });
  const y = makeItem({ title: 'Y', productId: 'Y', opportunityScore: 90, lewordEntryKeywords: [seed('kw2')] });
  const ranked = rankByProductGolden([x, y], 2);
  assert('전부 미측정 → 판매성 순 폴백', ranked[0]?.productId === 'Y', ranked.map((r) => r.productId).join(','));
}

// productRankScore: 골든이 판매성을 압도(가중 우위)하는지
{
  const highGoldenLowSell = computeProductRankScore(goldenItem);   // golden~ high, sell 55
  const lowGoldenHighSell = computeProductRankScore(hypeItem);     // golden~ low, sell 85
  assert('랭크점수: 고골든·중판매 > 저골든·고판매', highGoldenLowSell > lowGoldenHighSell,
    `goldenItem=${highGoldenLowSell} hypeItem=${lowGoldenHighSell}`);
}

// 정확도 게이트: 황금비는 검색량·문서수 둘 다 실측돼야 성립.
// 하나라도 0(추정/미측정)이면 골든으로 인정하지 않고 UI에 노출하지 않는다.
{
  const dcOnly = makeItem({
    title: '문서수만 실측', productId: 'dcOnly', opportunityScore: 50,
    lewordEntryKeywords: [{ keyword: 'x', relation: 'category', reason: 'r', searchVolume: 0, documentCount: 300, entryScore: 32, verdict: '데이터필요' }],
  });
  assert('정확도: 검색량 0(문서수만) → 골든 0', computeProductGoldenScore(dcOnly) === 0, `golden=${computeProductGoldenScore(dcOnly)}`);
  assert('정확도: 검색량 0 → bestEntryKeyword 없음(노출 차단)', bestMeasuredEntryKeyword(dcOnly) === null);

  const svOnly = makeItem({
    title: '검색량만', productId: 'svOnly', opportunityScore: 50,
    lewordEntryKeywords: [{ keyword: 'y', relation: 'category', reason: 'r', searchVolume: 5000, documentCount: 0, entryScore: 28, verdict: '데이터필요' }],
  });
  assert('정확도: 문서수 0(검색량만) → 골든 0', computeProductGoldenScore(svOnly) === 0, `golden=${computeProductGoldenScore(svOnly)}`);
  assert('정확도: 문서수 0 → bestEntryKeyword 없음', bestMeasuredEntryKeyword(svOnly) === null);
}

// ────────────────────────────────────────────────────────────
if (failed > 0) {
  console.error(`[shopping-purchase-angle] ❌ ${failed} failed / ${passed} passed`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log(`[shopping-purchase-angle] ✅ ${passed} passed`);
process.exit(0);
