'use strict';
/**
 * 분야(2026-10-01 사장님 "자동차 IT 는 안 보여") — 제목 단서가 먼저, 없으면 출처 블로그 주제(운영자가 목록에 적은 구역)의 다수결,
 * 그것도 없으면 사회·이슈. 예전엔 제목 단서만 봐서 자동차 · IT 분야가 아예 없었고 판 300장 중 225장이 사회·이슈였다.
 * 규칙은 사이트 homefeedLive.mjs 와 같아야 한다(같은 사례를 양쪽 테스트가 잠갔다).
 *
 * 2026-11-15 판 1,000장 실측으로 손본 것 — 낱말 하나가 분야를 정하던 곳:
 *  - '음주운전' 의 '운전' 이 자동차·IT 로(고경표 소식 10장) → 사건 말(음주운전 · 뺑소니)을 사회·이슈로 맨 앞에서 가른다.
 *  - '기아' 가 기아 타이거즈 FA 소식을 자동차·IT 로 → 기아는 차 낱말(EV · 신차 · 시승 …)이 붙을 때만.
 *  - '선수 출신 배우' 가 스포츠로, 요약 속 '공항' 한 번이 연예 소식을 여행·생활로 → 약한 말(선수 · 게임 · 공항 · 교통 · 날씨)은
 *    다른 분야의 뚜렷한 단서가 없을 때만 정한다.
 *  - 긴 요약에 곁가지로 한 번 나온 '건강' 이 드라마 소식을 건강으로 → 요약은 먼저 나온 분야가 아니라 서로 다른 단서 낱말이 가장 많은 분야(같은 낱말이 되풀이돼도 1).
 *  - 아이돌 · 열애 소식(뷔 · 재결합설)이 단서가 없어 사회·이슈 · 여행·생활로 → 연예 단서 낱말(열애 · 재결합 · 소속사 · 컴백 · 팬미팅 · 예능 · 시청률)을 더한다.
 *    그룹 · 인물 이름은 더하지 않는다(블랙핑크 제니의 자라 컬렉션 같은 패션 글이 연예로 갈 수 있다).
 */
const TOPIC_CATEGORY = { 'IT/차테크': '자동차·IT', 'IT·컴퓨터': '자동차·IT', '자동차': '자동차·IT', '재테크 라이프': '생활경제·주거', '비즈니스·경제': '생활경제·주거', '연예인 패션': '패션·뷰티', '패션·미용': '패션·뷰티', '미용·패션': '패션·뷰티', '방송 이슈': '문화·연예', '방송': '문화·연예', '드라마': '문화·연예', '스타·연예인': '문화·연예', '스포츠': '스포츠·게임', '건강 상식': '건강', '건강·의학': '건강', '리빙 라이프': '여행·생활', '인테리어·DIY': '여행·생활', '요리·레시피': '여행·생활', '맛집': '여행·생활', '육아·결혼': '여행·생활' };
const CATEGORY_PATTERNS = [
  ['사회·이슈', /음주\s*운전|만취\s*운전|무면허\s*운전|뺑소니/],
  ['생활경제·주거', /전세|주택|아파트|대출|지원금|연금|세금|청약|금리|부동산|소상공인|보조금|저축/],
  ['자동차·IT', /자동차|신차|전기차|하이브리드|SUV|세단|차량|(?<!음주\s?|만취\s?|무면허\s?)운전|주차|과태료|벌점|깜빡이|타이어|연비|현대차|기아차|기아\s*(?:EV|PV|K\d|SUV|스포티지|셀토스|니로|모닝|신차|전기차|자동차|모델|시승|출시|리콜)|제네시스|테슬라|벤츠|BMW|아우디|그랜저|쏘렌토|카니발|아이오닉|스마트폰|아이폰|갤럭시|노트북|태블릿|인공지능|챗GPT|요금제|통신사/],
  ['건강', /건강|다이어트|위고비|비만|혈압|혈당|당뇨|콜레스테롤|영양제|비타민|검진|위암|유방암|폐암|갑상선|두통|불면/],
  ['패션·뷰티', /패션|코디|착장|가방|샤넬|데님|세럼|화장품|여행룩/],
  ['여행·생활', /여행|숙소|호텔|런던|맛집/],
  ['스포츠·게임', /야구|축구|아시안게임|올림픽|메달|홈런|손흥민|이강인|김민재|A매치|월드컵|국가대표|K리그|EPL|프리킥|득점|결승골|선제골|\d+호골|골프|농구|배구/],
  ['문화·연예', /배우|가수|아이돌|방송|드라마|영화|콘서트|아이브|카즈하|고윤정|카리나|트로트|예능|시청률|소속사|열애|재결합|컴백|팬미팅/],
];
const WEAK_PATTERNS = [['스포츠·게임', /선수|게임/], ['여행·생활', /공항|교통|날씨/]];

const firstHit = (text, list) => (list.find(([, pattern]) => pattern.test(text)) || [])[0] || null;
function mostHit(text, list) {
  let best = null;
  for (const [name, pattern] of list) {
    const n = new Set(text.match(new RegExp(pattern.source, 'g')) || []).size;
    if (n > (best ? best[1] : 0)) best = [name, n];
  }
  return best && best[0];
}
function category(title, topics = [], summary = '') {
  const head = String(title ?? '');
  const byTitle = firstHit(head, CATEGORY_PATTERNS) || firstHit(head, WEAK_PATTERNS);
  if (byTitle) return byTitle;
  // 제목에 없으면 요약에서(2026-10-08) — 요약이 있는데 단서가 없으면 블로그 주제를 믿지 않는다(여러 주제를 쓰는 블로그: 차범근 · 부캉이 · 마케팅 글이 IT/차테크로 갔다)
  const body = String(summary || '');
  const bySummary = mostHit(body, CATEGORY_PATTERNS) || mostHit(body, WEAK_PATTERNS);
  if (bySummary) return bySummary;
  if (body.trim()) return '사회·이슈';
  const counts = new Map();
  for (const topic of topics) { const name = TOPIC_CATEGORY[topic]; if (name) counts.set(name, (counts.get(name) || 0) + 1); }
  let best = null;
  for (const [name, n] of counts) if (!best || n > best[1]) best = [name, n];
  return best ? best[0] : '사회·이슈';
}

module.exports = { category, CATEGORY_PATTERNS, WEAK_PATTERNS };
