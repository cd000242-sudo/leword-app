'use strict';
/*
 * 소재 묶기 규칙 — 두 글이 같은 소재인지 낱말로 가른다. 순수 함수만 있다(제목 → 낱말 풀이는 core 가 한다).
 *
 * 2026-11-15 판 1,000장 실측: 「간수치 정상인데 지방간」 카드에 테슬라 선쉐이드 리뷰, 뷔 카드에 한국민속촌 글, 향수공병 카드에
 * 제주공항 수하물 글이 묶였다. 겹친 말이 '있을까' · '보도' · 'SNS' · '장면' · '줄거리 · 출연진 · 몇부작' 같은 말뿐이었는데
 * 예전 규칙은 이것을 구체어로 셌다(구체어 둘 + 겹침 절반). 그래서
 *   1) 소재를 가리키지 않는 말(filler)은 겹침으로 세되 "같은 소재"의 근거로는 못 쓴다 — 고유어(identity)가 하나는 겹쳐야 묶는다.
 *   2) 묶은 뒤에도 대표 글과 고유어를 하나도 안 나누는 출처는 떼어 낸다(첫 글과는 겹쳐도 대표 글과 안 겹칠 수 있다).
 */

/*
 * 일반어 — 겹쳐도 같은 소재라는 근거가 못 되는 말(2026-10-01, 출처 188곳 첫 실수집의 오묶음에서 뽑았다:
 * '그랜저'+'정신', '얼굴' 하나로 다른 글이 한 카드가 됐다). 나이 · 순위 · 금액 같은 숫자 단위 말도 일반어다.
 */
const GENERIC = new Set(['패션', '스타일', '코디', '얼굴', '몸매', '미모', '비주얼', '연예인', '배우', '여배우', '남배우', '아이돌', '가수', '스타', '셀럽', '화보', '공항', '공항패션', '반전', '레전드', '충격', '대박', '난리', '정체', '방법', '후기', '정보', '추천', '비교', '가격', '신차', '출시', '발표', '사람들', '남자들', '여자들', '여자', '남자', '정신', '모습', '포인트', '느낌', '분위기', '매력', '인기', '순위', '역대', '최고', '최초', '완전', '하는', '되는', '있는', '없는', '보니', '같은', '이유가', '누구', '앞두고', '달라진', '몰라보게', '되더니', '했더니', '결혼', '명품', '가방', '명품백', '신상', '할인', '일정', '이벤트']);
const isGeneric = (token) => GENERIC.has(token) || /^\d{1,2}(대|세|살)$/.test(token) || /^\d+(위|명|개|원|만원|천만원|억|억원|km|%)$/.test(token);

/*
 * 소재 말투 · 정보글 틀 낱말 — 같은 소재가 아니어도 겹치는 말. 같은 소재 추천 상한(10/27 판 추천 329장 모의에서 '입고 · 줄거리 · 드레스' 로 다른 소재가
 * 엮였다)과 이번 묶기 둘 다 이 목록을 쓴다.
 */
const TEMPLATE_WORDS = new Set(['입고', '입은', '맞아', '이미', '나온', '찍은', '똑같', '똑같은', '남긴', '꺼낸', '드레스', '원피스', '가을', '겨울', '총정리', '줄거리', '결말', '해석', '결말해석', '출연진', '등장인물', '드라마', '영화', '리뷰', '등장', '다들', '너무', '이게', '대신', '마음', '사람', '엄마', '팬들', '평점', '원작', '재방송', '예고', '시청률', '근황', '사복', '사복패션', '주가', '전망']);
// 이번에 판 실측에서 더한 말: 뉴스 상투어(보도 · SNS · 장면), 드라마 정보 틀(몇부작 · OTT · 기본정보), 색 이름(올블랙 ⊃ 블랙), 효과 · 질문 말.
const EXTRA_FILLER = ['보도', 'sns', '장면', '단독', '속보', '몇부작', 'ott', '넷플릭스', '기본정보', '블랙', '화이트', '베이지', '그레이', '핑크', '효과', '가능성', '어떻게', '어떤', '왜', '무엇'];
// 질문 · 서술 꼬리('있을까' · '될까' · '정상인데' · '써볼지')는 소재가 아니라 말투다.
const PREDICATE_WORD = /^(있을|없을|있는|없는|하는|되는|있나|없나|있다|없다|된다|한다|할까|될까|일까)$/;
const PREDICATE_TAIL = /.+(을까|를까|인지|는지|을지|인데|는데|한데)$/;
const FILLER = new Set([...TEMPLATE_WORDS, ...EXTRA_FILLER]);
const isFiller = (token) => FILLER.has(token) || PREDICATE_WORD.test(token) || PREDICATE_TAIL.test(token);
const isIdentity = (token) => !isGeneric(token) && !isFiller(token);

/**
 * 겹친 말(단위) — 같은 말이면 그 말, 포함 관계('디올원영' ⊃ '원영')면 짧은 쪽이 단위다. 단위는 한 번만 센다:
 * '얼굴' 하나가 '얼굴경락' · '작은얼굴관리' 둘에 들어가도 1 이다(예전엔 2로 셌다). 포함 관계는 숫자 없는 말끼리만.
 */
function sharedUnits(a, b) {
  const contains = (t, u) => !/\d/.test(t) && !/\d/.test(u) && t.length >= 2 && u.length >= 2 && (t.includes(u) || u.includes(t));
  const units = new Set();
  for (const t of a) for (const u of b) {
    if (t === u) units.add(t);
    else if (contains(t, u)) units.add(t.length <= u.length ? t : u);
  }
  return [...units];
}
function sameStory(a, b) {
  const units = sharedUnits(a, b);
  const specific = units.filter((u) => !isGeneric(u)).length;
  const ratio = units.length / Math.min(a.length, b.length);
  // 구체어(사람 · 제품 · 작품 이름 등)가 둘 이상 겹치고, 겹친 말이 짧은 쪽의 절반 이상일 때만(0.25 로 풀었더니 188곳에서 거의 전부 묶였다).
  // 그중 하나는 고유어여야 한다 — '있을까 · 보도 · 줄거리' 처럼 말투 · 틀 낱말만 둘 겹친 글은 같은 소재가 아니다.
  return specific >= 2 && ratio >= 0.5 && units.some(isIdentity);
}

/**
 * 대표 글과 같은 소재인지 — 제목이 똑같거나(퍼 나른 글), 고유어를 하나라도 나눠야 한다.
 * opts.termsOf(post) → 낱말 배열, opts.keyOf(post) → 정규화한 제목.
 */
function relatedTo(lead, opts) {
  const leadTerms = opts.termsOf(lead);
  const leadKey = opts.keyOf(lead);
  return (post) => post === lead || opts.keyOf(post) === leadKey || sharedUnits(opts.termsOf(post), leadTerms).some(isIdentity);
}
const memo = (fn) => { const cache = new Map(); return (post) => { if (!cache.has(post)) cache.set(post, fn(post)); return cache.get(post); }; };
function memoized(opts) { return { ...opts, termsOf: memo(opts.termsOf), keyOf: memo(opts.keyOf) }; }

/**
 * 한 묶음을 대표 글 기준으로 가른다. 대표 글과 고유어를 하나도 안 나누는 글은 떼어 내고, 떨어진 글끼리는 다시 같은 방식으로 가른다
 * (버리지 않는다). 원래 순서를 지킨다. 가를 게 없으면 [posts] 하나. opts.byLead = 대표 글 순서(앞이 대표).
 */
function splitUnrelated(posts, rawOpts) {
  const opts = memoized(rawOpts);
  const parts = [];
  let rest = posts;
  while (rest.length) {
    const lead = [...rest].sort(opts.byLead)[0];
    const related = relatedTo(lead, opts);
    const keep = rest.filter(related);
    parts.push(keep);
    rest = rest.filter((post) => !keep.includes(post));
  }
  return parts;
}

/** 대표 글과 고유어를 하나도 안 나누는 출처가 하나라도 있는가(판 카드 · 안내 · 제목 짓기 전 거르기). */
function hasUnrelated(posts, lead, rawOpts) {
  const related = relatedTo(lead, memoized(rawOpts));
  return posts.some((post) => !related(post));
}

/** 판의 원문 주소 → 그 주소가 실린 카드 id. */
function urlOwners(candidates) {
  const owners = new Map();
  for (const card of Array.isArray(candidates) ? candidates : []) {
    for (const source of Array.isArray(card && card.sources) ? card.sources : []) if (source && source.url && !owners.has(source.url)) owners.set(source.url, card.id);
  }
  return owners;
}
/**
 * 저장된 제목 · 안내가 덮는 원문 주소가 지금 판의 카드 둘 이상에 흩어졌으면 true — 엉뚱한 출처가 섞인 옛 묶음으로 지은 내용이다.
 * 카드 id(대표 글 주소)가 그대로라 묶음이 갈라진 뒤에도 창고가 옛 제목 · 안내를 다시 붙이고, 갈라져 나간 카드는 원문 주소로 그것을 찾아간다.
 */
function spansCards(urls, owners) {
  return new Set((Array.isArray(urls) ? urls : []).map((url) => owners.get(url)).filter(Boolean)).size > 1;
}

module.exports = { isGeneric, isFiller, sharedUnits, sameStory, splitUnrelated, hasUnrelated, urlOwners, spansCards, TEMPLATE_WORDS };
