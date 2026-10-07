// 애드센스 고수 벤치마크 수집 · 묶기(2026-10-07). 홈판 벤치마크와 같은 틀, 출처는 티스토리 · 워드프레스.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./adsense-benchmarks-core.cjs');

const NOW = '2026-10-07T03:00:00.000Z';
const src = (id, host, over = {}) => ({ id, name: id + ' 블로그', url: `https://${host}`, feedUrl: `https://${host}/rss`, platform: 'tistory', category: '정부지원금·복지', grade: 'S', score: 100, weekPosts: 5, adsense: true, ...over });
const SOURCES = [src('a', 'a.tistory.com'), src('b', 'b.tistory.com', { grade: 'A' }), src('c', 'c.com', { platform: 'wordpress', category: '금융·재테크' })];

test('등록된 도메인 · https 만 받는다(허용목록 밖 · http · 포트 · 계정 차단)', () => {
  const allow = core.buildAllowlist(SOURCES);
  assert.equal(core.assertFeedUrl('https://a.tistory.com/rss', allow).hostname, 'a.tistory.com');
  assert.equal(core.assertFeedUrl('https://www.c.com/feed', allow).hostname, 'www.c.com', 'www 붙은 같은 도메인은 같은 출처');
  for (const bad of ['http://a.tistory.com/rss', 'https://evil.com/rss', 'https://a.tistory.com:8443/rss', 'https://u:p@a.tistory.com/rss', 'https://x.tistory.com/rss']) {
    assert.throws(() => core.assertFeedUrl(bad, allow), /Blocked/, bad);
  }
});

const rss = (items) => `<?xml version="1.0"?><rss><channel><title>채널</title>${items.map((i) => `<item><title><![CDATA[${i.t}]]></title><link>${i.l}</link><pubDate>${i.d}</pubDate><description><![CDATA[<p>본문 ${i.t}</p>]]></description></item>`).join('')}</channel></rss>`;
const atom = (items) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>아톰</title>${items.map((i) => `<entry><title>${i.t}</title><link rel="alternate" href="${i.l}"/><published>${i.d}</published></entry>`).join('')}</feed>`;

test('RSS · Atom 을 읽고 그 블로그 도메인 밖 링크는 버린다', () => {
  const r = core.parseFeed(rss([
    { t: '청년도약계좌 해지 조건과 불이익', l: 'https://a.tistory.com/123', d: 'Tue, 6 Oct 2026 10:00:00 +0900' },
    { t: '광고 글', l: 'https://spam.example/1', d: 'Tue, 6 Oct 2026 10:00:00 +0900' },
  ]), SOURCES[0], NOW);
  assert.equal(r.posts.length, 1);
  assert.equal(r.posts[0].url, 'https://a.tistory.com/123');
  assert.equal(r.posts[0].publishedAt, '2026-10-06T01:00:00.000Z');
  const a = core.parseFeed(atom([{ t: '근로장려금 지급일 확인', l: 'https://www.c.com/geunro', d: '2026-10-05T09:00:00Z' }]), SOURCES[2], NOW);
  assert.equal(a.posts.length, 1);
  assert.equal(a.posts[0].sourceId, 'c');
});

const post = (sourceId, title, url, publishedAt = '2026-10-06T01:00:00.000Z') => ({ sourceId, title, url, publishedAt, capturedAt: NOW });

test('두 블로그가 같은 소재를 다루면 한 카드 ★ · 공통어만 겹치면 묶지 않는다 · 7일 지난 글은 뺀다', () => {
  const posts = [
    post('a', '청년도약계좌 중도해지 조건 총정리 2026', 'https://a.tistory.com/1'),
    post('b', '청년도약계좌 중도해지 불이익 얼마나', 'https://b.tistory.com/9'),
    post('a', '2026 근로장려금 신청 방법 총정리', 'https://a.tistory.com/2'),
    post('c', '2026 에너지바우처 신청 방법 총정리', 'https://www.c.com/3'),
    post('c', '청년도약계좌 중도해지 예전 글', 'https://www.c.com/old', '2026-09-20T01:00:00.000Z'),
  ];
  const board = core.buildBoard([{ id: 'a', status: 'ok', posts: posts.filter((p) => p.sourceId === 'a') }, { id: 'b', status: 'ok', posts: posts.filter((p) => p.sourceId === 'b') }, { id: 'c', status: 'ok', posts: posts.filter((p) => p.sourceId === 'c') }], SOURCES, NOW);
  const youth = board.candidates.find((c) => c.title.includes('청년도약계좌'));
  assert.equal(youth.recommended, false, '두 블로그는 아직 ★ 아님(3곳부터)');
  assert.equal(youth.sources.length, 2, '7일 지난 글은 묶음에 안 들어간다');
  const separate = board.candidates.filter((c) => /근로장려금|에너지바우처/.test(c.title));
  assert.equal(separate.length, 2, "'신청 방법 총정리 2026'만 겹친 두 글은 다른 소재");
  assert.ok(separate.every((c) => !c.recommended));
  assert.equal(board.candidates[0].title.includes('청년도약계좌'), true, '여러 블로그 소재가 앞에 선다');
  assert.ok(!JSON.stringify(board).includes('ca-pub'));
});

test('카드 상한 · 고수 제목 모양 통계 · 수집 실패 출처는 판에 상태로만', () => {
  const many = Array.from({ length: 30 }, (_, i) => post('a', `서로다른소재${i} 제목${i} 키워드${i}`, `https://a.tistory.com/${i}`));
  const board = core.buildBoard([{ id: 'a', status: 'ok', posts: many }, { id: 'b', status: 'error', error: 'HTTP 403', posts: [] }], SOURCES, NOW, { maxCards: 10 });
  assert.equal(board.candidates.length, 10);
  assert.equal(board.okCount, 1);
  assert.equal(board.sources.find((s) => s.id === 'b').status, 'error');
  const shape = core.titleShape([post('a', '2026 청년도약계좌 해지하면 얼마 손해일까?', 'u1'), post('a', '근로장려금 지급일 [정리]', 'u2')]);
  assert.equal(shape.count, 2);
  assert.equal(shape.yearPct, 50);
  assert.equal(shape.questionPct, 50);
  assert.equal(shape.bracketPct, 50);
});

test('★ 는 블로그 3곳부터 · 동사 꼴 · 범용 명사만 겹친 글은 묶지 않는다', () => {
  const three = ['a', 'b', 'c'].map((id, i) => post(id, '누리호 5차 발사일정 생중계 시간', `https://${id === 'c' ? 'www.c.com' : id + '.tistory.com'}/n${i}`));
  const loose = [post('a', '장애인연금 부부도 받을 수 있을까', 'https://a.tistory.com/x1'), post('b', '국가장학금 누구나 받을 수 있을까', 'https://b.tistory.com/x2'),
    post('a', '장판 종류 우리 집에 맞는 선택법', 'https://a.tistory.com/x3'), post('b', 'TV 인치별 사이즈 우리 집에 맞는 크기', 'https://b.tistory.com/x4')];
  const all = [...three, ...loose];
  const board = core.buildBoard(['a', 'b', 'c'].map((id) => ({ id, status: 'ok', posts: all.filter((p) => p.sourceId === id) })), SOURCES, NOW);
  const nuri = board.candidates.find((c) => c.title.includes('누리호'));
  assert.equal(nuri.recommended, true);
  assert.equal(nuri.sources.length, 3);
  for (const word of ['장애인연금', '국가장학금', '장판', 'TV']) assert.equal(board.candidates.filter((c) => c.sources.some((s) => s.title.includes(word))).length, 1, word);
  assert.equal(board.candidates.find((c) => c.title.includes('장애인연금')).sources.length, 1, "'받을 수 있을까'만 겹친 글은 따로");
  assert.equal(board.candidates.find((c) => c.title.includes('장판')).sources.length, 1, "'우리 집에 맞는'만 겹친 글은 따로");
});

test('서비스 공통어(고객센터 · 전화번호 · 설정)만 겹친 다른 회사 · 기능은 묶지 않는다', () => {
  const all = [post('a', '배달의민족 고객센터 전화번호 상담원 연결 총정리', 'https://a.tistory.com/y1'), post('b', '하나카드 고객센터 전화번호 상담원 연결 방법', 'https://b.tistory.com/y2'),
    post('a', '윈도우 11 업그레이드 조직 설정으로 차단될 때', 'https://a.tistory.com/y3'), post('b', '윈도우 11 화면만 끄는 설정', 'https://b.tistory.com/y4')];
  const board = core.buildBoard(['a', 'b'].map((id) => ({ id, status: 'ok', posts: all.filter((p) => p.sourceId === id) })), SOURCES, NOW);
  assert.equal(board.candidates.length, 4, board.candidates.map((c) => c.sources.length).join(','));
});

test('방화벽이 머리글을 거르면(415) 흔한 형식 머리글로 한 번 더 묻는다', async () => {
  const { collectAll } = require('./adsense-benchmarks.cjs');
  const asked = [];
  const fetcher = async (url, allow, opts) => {
    asked.push(opts && opts.headers ? opts.headers.Accept : 'feed');
    if (!opts) throw new Error('HTTP 415');
    return '<rss><channel><title>t</title><item><title>워드프레스 글 하나</title><link>https://www.c.com/p1</link><pubDate>Tue, 6 Oct 2026 10:00:00 +0900</pubDate></item></channel></rss>';
  };
  const results = await collectAll([SOURCES[2]], NOW, { concurrency: 1, fetcher });
  assert.equal(results[0].status, 'ok');
  assert.equal(results[0].posts.length, 1);
  assert.deepEqual(asked, ['feed', '*/*']);
});

// 사장님(2026-10-07): "자동화된 접근차단이 뜬다" — 티스토리 429 페이지("과도한 접근 요청으로 블로그 사용이 잠시 중단… 자동화된 접근").
// 같은 IP 로 사장님이 티스토리를 볼 때도 막힌다. 429 를 다시 두드리면 차단이 길어지므로 그 회차 티스토리는 거기서 멈춘다.
const RSS = (host) => `<rss><channel><title>t</title><item><title>${host} 글 하나</title><link>https://${host}/9</link><pubDate>Tue, 6 Oct 2026 10:00:00 +0900</pubDate></item></channel></rss>`;

test('티스토리가 429 를 한 번 주면 그 회차 티스토리는 더 묻지 않는다(다른 블로그는 계속)', async () => {
  const { collectAll } = require('./adsense-benchmarks.cjs');
  const sources = [src('t1', 't1.tistory.com'), src('t2', 't2.tistory.com'), src('t3', 't3.tistory.com'), src('w1', 'w1.com', { platform: 'wordpress' })];
  const asked = [];
  const fetcher = async (url) => { asked.push(new URL(url).hostname); if (url.includes('tistory')) throw new Error('HTTP 429'); return RSS(new URL(url).hostname); };
  const results = await collectAll(sources, NOW, { concurrency: 4, tistoryConcurrency: 1, fetcher, sleep: async () => {} });
  assert.equal(asked.filter((h) => h.endsWith('tistory.com')).length, 1, asked.join(','));
  assert.equal(results[0].status, 'error');
  assert.deepEqual(results.slice(1, 3).map((r) => r.status), ['skipped', 'skipped']);
  assert.match(results[1].error, /티스토리/);
  assert.equal(results[3].status, 'ok');
});

test('티스토리는 따로 천천히 — 동시 수 상한 · 요청 사이 쉼', async () => {
  const { collectAll } = require('./adsense-benchmarks.cjs');
  const sources = Array.from({ length: 6 }, (_, i) => src('t' + i, `t${i}.tistory.com`));
  let inFlight = 0; let peak = 0; const pauses = [];
  const fetcher = async (url) => { inFlight += 1; peak = Math.max(peak, inFlight); await new Promise((r) => setImmediate(r)); inFlight -= 1; return RSS(new URL(url).hostname); };
  const results = await collectAll(sources, NOW, { concurrency: 16, tistoryConcurrency: 2, tistoryGapMs: 700, fetcher, sleep: async (ms) => { pauses.push(ms); } });
  assert.ok(results.every((r) => r.status === 'ok'));
  assert.ok(peak <= 2, '티스토리 동시 ' + peak);
  assert.ok(pauses.filter((ms) => ms === 700).length >= 4, '쉼: ' + pauses.join(','));
});

// 사장님 지적(2026-10-07 스크린샷): '뷰티·패션' 칩에 '비상금대출 거절 사유' — 분야를 블로그(엑셀) 분야로 매겨서였다.
// 또 '거절 사유'만 겹친 비상금대출 · 네이버페이 환불 · 금리인하요구권이 한 카드였다.
test('분야는 글 제목 내용으로 매긴다 — 블로그 분야는 제목에 단서가 없을 때만', () => {
  assert.equal(core.categoryOf(['비상금대출 거절 사유, 통신비·알뜰폰도 걸릴까'], ['뷰티·패션']), '금융·재테크');
  assert.equal(core.categoryOf(['2026 근로장려금 지급일과 신청 대상'], ['IT·테크·AI']), '정부지원금·복지');
  assert.equal(core.categoryOf(['연말정산 월세 세액공제 조건'], ['금융·재테크']), '세금·행정·법률');
  assert.equal(core.categoryOf(['청약 가점 계산과 1순위 조건'], ['종합·기타']), '부동산');
  assert.equal(core.categoryOf(['윈도우 11 화면만 끄는 설정'], ['금융·재테크']), 'IT·테크·AI');
  assert.equal(core.categoryOf(['독감 예방접종 무료 대상 나이'], ['여행·맛집']), '건강·의학');
  assert.equal(core.categoryOf(['자동차보험 갱신 할인 특약'], ['금융·재테크']), '자동차');
  assert.equal(core.categoryOf(['화담숲 단풍 절정 시기와 모노레일 예약'], ['금융·재테크']), '여행·맛집');
  assert.equal(core.categoryOf(['손흥민 A매치 최다골 신기록'], ['금융·재테크']), '스포츠·게임·취미');
  assert.equal(core.categoryOf(['임플란트 비용 정리: 평균 시세와 건강보험 적용 조건'], ['금융·재테크']), '건강·의학');
  assert.equal(core.categoryOf(['2026 건강보험 피부양자 등록 소득·재산 기준'], ['뷰티·패션']), '정부지원금·복지', "'피부양자'는 피부가 아니다");
  assert.equal(core.categoryOf(['신생아 특례 디딤돌대출 조건과 금리'], ['육아·교육']), '부동산');
  assert.equal(core.categoryOf(['고속도로 통행료 다자녀 할인 신청'], ['쇼핑·제품리뷰']), '자동차');
  assert.equal(core.categoryOf(['도시가스 요금조회 방법과 캐시백'], ['쇼핑·제품리뷰']), '생활정보·꿀팁');
  assert.equal(core.categoryOf(['개인회생 변제율 계산, 가구원 수별 모의계산'], ['뷰티·패션']), '세금·행정·법률');
  assert.equal(core.categoryOf(['알 수 없는 소재', '육아휴직급여 신청', '육아휴직 기간 계산', '선크림 고르는 법'], []), '육아·교육', '묶음 제목은 다수결 — 한 편의 낱말이 이기지 않는다');
  assert.equal(core.categoryOf(['알 수 없는 제목 하나'], ['반려동물', '반려동물', '건강·의학']), '반려동물', '단서 없으면 블로그 분야 다수결');
});

test("'거절 사유'만 겹친 다른 소재는 묶지 않는다", () => {
  const all = [post('a', '비상금대출 거절 사유, 통신비·알뜰폰도 걸릴까', 'https://a.tistory.com/z1'), post('b', '네이버페이 포인트 환불 거절 사유와 해결 방안', 'https://b.tistory.com/z2'),
    post('c', '금리인하요구권 신청 방법: 대상 대출·수용률·거절 사유 5가지와 대응', 'https://www.c.com/z3')];
  const board = core.buildBoard(['a', 'b', 'c'].map((id) => ({ id, status: 'ok', posts: all.filter((p) => p.sourceId === id) })), SOURCES, NOW);
  assert.equal(board.candidates.length, 3, board.candidates.map((c) => c.sources.length).join(','));
  assert.equal(board.candidates.find((c) => c.title.includes('비상금대출')).category, '금융·재테크');
});

test("'실전 · 비용'만 겹친 다른 소재는 묶지 않는다(케이블카 ↔ 모니터 케이블, 임플란트 ↔ 당뇨 검사)", () => {
  const all = [post('a', '설악산 케이블카 예약 방법과 주차장 혼잡 피하는 실전 팁', 'https://a.tistory.com/k1'), post('b', 'PC 모니터 신호 없음일 때 그래픽카드·케이블·램 자가 점검 실전 가이드', 'https://b.tistory.com/k2'),
    post('a', '임플란트 비용 정리: 평균 시세와 건강보험 적용 조건', 'https://a.tistory.com/k3'), post('b', '당뇨 검사 비용 얼마나 나올까 2026 총정리', 'https://b.tistory.com/k4')];
  const board = core.buildBoard(['a', 'b'].map((id) => ({ id, status: 'ok', posts: all.filter((p) => p.sourceId === id) })), SOURCES, NOW);
  assert.equal(board.candidates.length, 4, board.candidates.map((c) => c.keyword).join(' | '));
});

// 사장님(2026-10-07 스크린샷): "추석 지났는데도 추석 민생지원금을 쓰는 사람이 있는가" — 고수 5곳이 10-06 에 썼어도 지난 명절 소재는 판에서 뺀다.
test('지난 명절 · 기념일 소재는 뺀다 — 앞두고 있거나 막 지난 사흘은 남긴다', () => {
  const off = (title, now) => core.isOffSeasonTitle(title, now);
  assert.equal(off('2026 추석 민생지원금 지역별 총정리-전남광주 장흥군', '2026-10-07T03:00:00Z'), true);
  assert.equal(off('추석 선물세트 추천', '2026-09-10T03:00:00Z'), false, '앞두고 있음');
  assert.equal(off('추석 연휴 고속도로 정체', '2026-09-29T03:00:00Z'), false, '끝나고 사흘 안');
  assert.equal(off('한가위 인사말 모음', '2026-10-07T03:00:00Z'), true);
  assert.equal(off('2027 추석 기차표 예매', '2027-08-10T03:00:00Z'), false, '다음 추석 45일 안');
  assert.equal(off('설날 선물 추천', '2026-10-07T03:00:00Z'), true, '다음 설날은 넉 달 뒤');
  assert.equal(off('설날 기차표 예매 일정', '2027-01-05T03:00:00Z'), false);
  assert.equal(off('크리스마스 선물 추천', '2026-12-30T03:00:00Z'), true);
  assert.equal(off('크리스마스 선물 추천', '2026-11-20T03:00:00Z'), false);
  assert.equal(off('민생지원금 사용처와 사용 기한', '2026-10-07T03:00:00Z'), false, '명절 말이 없으면 그대로');
});

test('판에서 지난 명절 카드를 빼고 몇 장 뺐는지 남긴다', () => {
  const now = '2026-10-07T03:00:00.000Z';
  const all = [post('a', '2026 추석 민생지원금 지역별 총정리', 'https://a.tistory.com/s1', '2026-10-06T01:00:00.000Z'), post('b', '추석 민생지원금 지역별 신청 방법', 'https://b.tistory.com/s2', '2026-10-06T02:00:00.000Z'),
    post('a', '근로장려금 지급일과 신청 대상', 'https://a.tistory.com/s3', '2026-10-06T01:00:00.000Z')];
  const board = core.buildBoard(['a', 'b'].map((id) => ({ id, status: 'ok', posts: all.filter((p) => p.sourceId === id) })), SOURCES, now);
  assert.deepEqual(board.candidates.map((c) => c.title), ['근로장려금 지급일과 신청 대상']);
  assert.equal(board.offSeasonDropped, 1);
});

// 2026-10-07 실회차: '개인정보처리방침' 카드 — 블로그 안내 페이지(/pages/ · /notice/, 개인정보처리방침 · 이용약관)가 RSS 에 섞여 소재가 됐다.
test('블로그 안내 페이지(개인정보처리방침 · 이용약관 · /pages/ · /notice/)는 소재에서 뺀다 — 개인회생 "면책" 같은 진짜 소재는 남긴다', () => {
  const all = [
    post('a', '개인정보처리방침', 'https://a.tistory.com/pages/privacy-policy'),
    post('b', 'LIMSTORY 개인정보처리방침', 'https://b.tistory.com/notice/33'),
    post('a', '블로그 이용약관 안내', 'https://a.tistory.com/88'),
    post('b', '개인회생 신청 자격과 원금 최대 90% 면책 조건', 'https://b.tistory.com/90'),
  ];
  const board = core.buildBoard(['a', 'b'].map((id) => ({ id, status: 'ok', posts: all.filter((p) => p.sourceId === id) })), SOURCES, NOW);
  assert.deepEqual(board.candidates.map((c) => c.title), ['개인회생 신청 자격과 원금 최대 90% 면책 조건']);
});
