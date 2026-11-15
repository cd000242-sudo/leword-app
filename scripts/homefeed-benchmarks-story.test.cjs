/**
 * 소재 묶기 — 엉뚱한 출처가 한 카드에 묶이지 않게(2026-11-15).
 * 실측(판 1,000장): 「간수치 정상인데 지방간」 카드에 테슬라 선쉐이드 리뷰, 뷔 카드에 한국민속촌 글, 향수공병 카드에
 * 제주공항 수하물 글이 섞였고 그 카드의 제목 · 작성 안내가 엉뚱한 출처 내용으로 지어졌다.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./homefeed-benchmarks-core.cjs');

const now = '2026-11-15T03:00:00.000Z';
const hoursAgo = (h) => new Date(Date.parse(now) - h * 3600000).toISOString();
let seq = 0;
const make = (title, extra = {}) => {
  seq += 1;
  return { sourceId: `ch${seq}`, platform: 'naver-blog', name: `채널${seq}`, topic: null, eventAt: null, capturedAt: now, title, url: `https://blog.naver.com/ch${seq}/${1000 + seq}`, publishedAt: hoursAgo(3), summary: `${title} 요약`, metrics: { views: null, likes: null, comments: null }, ...extra };
};
const titlesOf = (card) => card.sources.map((s) => s.title);

// 판에서 그대로 가져온 오묶음 쌍 — 겹친 말은 '있을까' · '보도' · 'SNS' · '장면' · 템플릿 말(줄거리 · 출연진 · 몇부작 · OTT · 정보)뿐이다.
const MIXED_PAIRS = [
  ['간수치 정상인데 지방간 있을 수 있을까? 건강검진 결과에서 놓치기 쉬운 간 건강 이상 신호', '멜라논크림 진짜 효과 있을까?'],
  ['간수치 정상인데 지방간 있을 수 있을까? 건강검진 결과에서 놓치기 쉬운 간 건강 이상 신호', '리뷰 1,160개 읽어봤습니다! 티슬릭스 테슬라 전동 오토 슬림핏 선쉐이드, 뛰어난 개방감과 열 차단 효과를 만족스럽게 사용할 수 있을까?'],
  ['뷔, 제니와 재결합설 보도 이후 SNS 공개…사진 속 뜻밖의 장면', '중앙일보 단독 보도에 따르면 한국민속촌 가을축제 중 귀신 분장 배우가 네 살 아동에게 공포심을 주는 장면이 SNS에서 약 800만 회 조회되며 아동학대 논란이 일었습니다'],
  ['문무 기본정보 등장인물관계도 몇부작 출연진 ott 줄거리 넷플릭스 (사극 드라마)', '보스의 노골적 취향 출연진·몇부작·줄거리 총정리｜원작과 OTT 정보'],
];
test('질문 꼬리 · 뉴스 상투어 · 드라마 정보 템플릿 말만 겹치면 다른 소재다', () => {
  for (const [a, b] of MIXED_PAIRS) {
    const cards = core.buildCandidates([make(a), make(b)], now);
    assert.equal(cards.length, 2, `${a.slice(0, 30)} / ${b.slice(0, 30)}`);
    for (const card of cards) assert.equal(card.sources.length, 1);
  }
});

test('이름(고유어)이 겹치면 질문 꼬리가 달라도 같은 소재다', () => {
  const cards = core.buildCandidates([
    make('닥터엑스 김지원 결말 시청률 될까'),
    make('김지원 닥터엑스 결말 있을까'),
  ], now);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].sources.length, 2);
});

// 첫 글(알파곰 베타곰 감마곰 델타곰)과는 각각 두 낱말씩 겹쳐 한 묶음이 됐지만, 대표 글(알파곰 베타곰 엡실곰)과 제타곰 글은 겹치는 낱말이 0이다.
test('대표 글과 의미 있는 낱말을 하나도 안 나누는 출처는 그 카드에서 떨어져 자기 카드가 된다', () => {
  const first = make('알파곰 베타곰 감마곰 델타곰', { publishedAt: hoursAgo(9), summary: '' });
  const lead = make('알파곰 베타곰 엡실곰', { publishedAt: hoursAgo(1) });
  const stray = make('감마곰 델타곰 제타곰', { publishedAt: hoursAgo(5) });
  const cards = core.buildCandidates([first, lead, stray], now);
  const urls = cards.flatMap((c) => c.sources.map((s) => s.url)).sort();
  assert.deepEqual(urls, [first.url, lead.url, stray.url].sort(), '떨어진 출처도 버리지 않는다');
  const leadCard = cards.find((c) => c.title === lead.title);
  assert.deepEqual(leadCard.sources.map((s) => s.url).sort(), [first.url, lead.url].sort());
  const strayCard = cards.find((c) => c.title === stray.title);
  assert.deepEqual(titlesOf(strayCard), [stray.title]);
  assert.notEqual(strayCard.id, leadCard.id);
});

test('대표 글이 엉뚱한 글이면 나머지 글이 서로 다시 묶인다', () => {
  const a = make('간수치 정상인데 지방간 있을 수 있을까? 건강검진 결과', { publishedAt: hoursAgo(8) });
  const b = make('건강검진에서 간수치 정상인데 지방간 있을 수 있을까? 초음파 검사', { publishedAt: hoursAgo(7) });
  const lead = make('테슬라 선쉐이드 있을까?', { publishedAt: hoursAgo(1) });
  const cards = core.buildCandidates([a, b, lead], now);
  assert.equal(cards.some((c) => c.sources.some((s) => /테슬라/.test(s.title)) && c.sources.some((s) => /간수치/.test(s.title))), false, '테슬라 글이 간수치 글과 한 카드에 있으면 안 된다');
  assert.ok(cards.some((c) => c.sources.length === 2 && c.sources.every((s) => /간수치/.test(s.title))), '간수치 글 둘은 한 카드로 남는다');
});

test('제목이 똑같은 퍼 나른 글은 낱말이 없어도 한 카드에 남는다(예전 규칙)', () => {
  const cards = core.buildCandidates([make('이거 실화냐', { summary: '요약' }), make('이거 실화냐', { summary: '요약' })], now);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].sources.length, 2);
  assert.ok(cards[0].flags.includes('possible-syndication'));
});

test('묶음이 의심되는 카드 판별 — 대표와 안 겹치는 출처가 있으면 참, 정상 · 단일 출처 · 같은 제목이면 거짓', () => {
  const src = (title) => ({ title, url: `https://blog.naver.com/x/${title.length}${seq++}` });
  const mixed = { title: '간수치 정상인데 지방간 있을 수 있을까?', sources: [src('간수치 정상인데 지방간 있을 수 있을까?'), src('멜라논크림 진짜 효과 있을까?')] };
  const fine = { title: '디올과 원영의 만남', sources: [src('디올과 원영의 만남'), src('디올원영 어떤데?')] };
  assert.equal(core.hasUnrelatedSources(mixed), true);
  assert.equal(core.hasUnrelatedSources(fine), false);
  assert.equal(core.hasUnrelatedSources({ title: 't', sources: [src('단일')] }), false);
  assert.equal(core.hasUnrelatedSources({ title: '이거 실화냐', sources: [src('이거 실화냐'), src('이거 실화냐')] }), false);
  assert.equal(core.hasUnrelatedSources({}), false);
  assert.equal(core.hasUnrelatedSources(null), false);
});

test('작성 안내를 짓기 전에 의심 카드를 거른다', () => {
  const { cardsForGuides } = require('./enrich-benchmark-guides.js');
  const row = (id, titles) => ({ id, keyword: `키워드${id}`, title: titles[0], category: '사회·이슈', summary: '요약', status: 'review-now', sources: titles.map((t, i) => ({ url: `https://blog.naver.com/${id}/${i}`, title: t })), flags: [] });
  const board = { candidates: [row('ok', ['디올과 원영의 만남', '디올원영 어떤데?']), row('bad', ['간수치 정상인데 지방간 있을 수 있을까?', '멜라논크림 진짜 효과 있을까?'])] };
  assert.deepEqual(cardsForGuides(board).map((c) => c.id), ['ok']);
});

test('제목을 짓기 전에 의심 카드를 거른다', () => {
  const { dropMixedCards } = require('./enrich-benchmark-titles.js');
  const row = (id, titles) => ({ id, title: titles[0], sources: titles.map((t, i) => ({ url: `https://blog.naver.com/${id}/${i}`, title: t })) });
  const board = { schemaVersion: 1, candidates: [row('ok', ['디올과 원영의 만남', '디올원영 어떤데?']), row('bad', ['간수치 정상인데 지방간 있을 수 있을까?', '멜라논크림 진짜 효과 있을까?'])] };
  const out = dropMixedCards(board);
  assert.deepEqual(out.candidates.map((c) => c.id), ['ok']);
  assert.equal(board.candidates.length, 2, '원본 판은 건드리지 않는다');
  assert.equal(out.schemaVersion, 1);
});

// 옛 묶음(엉뚱한 출처가 섞인 카드)으로 지은 제목 · 안내는 묶음이 갈라진 뒤에도 카드 id 로 다시 붙는다 — 갈라진 판에서는 쓰지 않는다.
const card = (id, urls) => ({ id, title: `카드 ${id}`, sources: urls.map((url) => ({ url, title: `글 ${url}` })) });
const splitBoard = { candidates: [card('liver', ['https://x/liver1', 'https://x/liver2']), card('tesla', ['https://x/tesla']), card('solo', ['https://x/solo'])] };

test('저장된 항목이 덮는 원문 주소가 판의 카드 둘 이상에 흩어졌는지 가린다', () => {
  const { urlOwners, spansCards } = require('./homefeed-benchmarks-story.cjs');
  const owners = urlOwners(splitBoard.candidates);
  assert.equal(spansCards(['https://x/liver1', 'https://x/tesla'], owners), true);
  assert.equal(spansCards(['https://x/liver1', 'https://x/liver2', 'https://x/gone-from-board'], owners), false, '판에 없는 주소는 세지 않는다');
  assert.equal(spansCards(['https://x/solo'], owners), false);
  assert.equal(spansCards(undefined, owners), false);
});

test('제목 창고 — 갈라진 카드에 옛 묶음 제목을 붙이지 않는다(카드 id · 원문 주소 어느 쪽으로도)', () => {
  const { attachTitles, dropMisfitEntries } = require('./enrich-benchmark-titles.js');
  const at = new Date().toISOString();
  const entries = [
    { id: 'liver', urls: ['https://x/liver1', 'https://x/tesla'], titles: ['테슬라 선쉐이드 제목'], at },
    { id: 'solo', urls: ['https://x/solo'], titles: ['솔로 제목'], at },
  ];
  const kept = dropMisfitEntries(entries, splitBoard);
  assert.deepEqual(kept.map((e) => e.id), ['solo']);
  const attached = attachTitles(splitBoard, kept).candidates;
  assert.deepEqual(attached.map((c) => c.homeTitles.length), [0, 0, 1], '간수치 카드도 테슬라 카드도 옛 제목을 받지 않는다');
});

test('안내 창고 — 갈라진 카드에 옛 묶음 안내를 남기지 않는다', () => {
  const { pruneStore } = require('./enrich-benchmark-guides.js');
  const nowMs = Date.now();
  const guide = { direction: '방향' };
  const at = new Date(nowMs).toISOString();
  const store = { guides: [{ id: 'liver', urls: ['https://x/liver1', 'https://x/tesla'], guide, at }, { id: 'solo', urls: ['https://x/solo'], guide, at }], misses: [] };
  assert.deepEqual(pruneStore(store, splitBoard, nowMs).guides.map((g) => g.id), ['solo']);
});
