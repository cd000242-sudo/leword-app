/**
 * 애드센스 고수 벤치마크 — 수집 · 소재 묶기 · 판 만들기(2026-10-07, 사장님 엑셀 786곳).
 *
 * 홈판 벤치마크(homefeed-benchmarks-core)와 같은 틀이다: RSS 를 읽고 → 여러 블로그가 함께 다룬 소재를 ★ 로 앞에 세우고 →
 * 카드 1,000장 상한. 다른 점은 셋.
 *   1) 출처가 티스토리 · 워드프레스라 주소 허용목록을 **등록된 786개 도메인**으로 만든다(홈판은 네이버 · 유튜브 고정 목록).
 *   2) 애드센스 글은 오래 읽혀서 창이 48시간이 아니라 7일이다.
 *   3) 애드센스 제목은 '신청 방법 · 조건 · 총정리 · 2026' 같은 공통어가 많아 그 말만 겹친 글은 묶지 않는다.
 * 본문은 싣지 않는다 — 제목 · 링크 · 발행일만(저작권). 애드센스 pub ID 도 싣지 않는다.
 */
'use strict';

const crypto = require('crypto');
const cheerio = require('cheerio');
const { plainText, validDate } = require('./homefeed-benchmarks-core.cjs');

const DAY = 86400000;
const WINDOW_DAYS = 7;
const MAX_CARDS = 1000;
const MAX_POSTS_PER_FEED = 30;

const baseHost = (host) => String(host || '').toLowerCase().replace(/^www\./, '');

/** 등록된 출처의 도메인 → 출처. www 는 같은 도메인으로 본다. */
function buildAllowlist(sources) {
  const map = new Map();
  for (const s of sources || []) {
    for (const value of [s.feedUrl, s.url]) {
      try { map.set(baseHost(new URL(value).hostname), s); } catch { /* 잘못된 주소는 목록에 안 넣는다 */ }
    }
  }
  return map;
}

function assertFeedUrl(value, allow) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allow.has(baseHost(url.hostname))) throw new Error('Blocked source URL');
  return url;
}

/** 글 주소 — https 이고 그 블로그 도메인(www 포함)일 때만. 추적용 쿼리 · 조각은 뗀다. */
function postLink(value, source) {
  try {
    const u = new URL(String(value || '').trim());
    const own = [source.feedUrl, source.url].map((v) => { try { return baseHost(new URL(v).hostname); } catch { return ''; } });
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !own.includes(baseHost(u.hostname))) return null;
    for (const key of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(key)) u.searchParams.delete(key);
    u.hash = '';
    return u.href;
  } catch { return null; }
}

// 본문을 통째로 싣는 RSS 가 3MB 를 넘었다(첫 실수집 15곳) — 10MB 까지.
/*
 * 깃허브 서버에서 첫 회차(2026-10-07) 워드프레스 61곳이 HTTP 415 — 로컬에선 같은 주소가 다 됐다. 호스팅 방화벽이
 * 머리글(Accept 가 RSS 형식뿐 · 낯선 User-Agent)을 거른다. 403/406/415 이면 흔한 형식 머리글로 한 번 더 묻는다.
 */
const PLAIN_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; LEWORD-PublicBenchmark/1.0; +https://leaderspro.kr)', Accept: '*/*' };
const FEED_HEADERS = { 'User-Agent': 'LEWORD-PublicBenchmark/1.0', Accept: 'application/rss+xml,application/atom+xml,application/xml;q=0.9,text/xml;q=0.8' };
async function fetchFeed(value, allow, { fetchImpl = fetch, maxBytes = 10000000, timeoutMs = 15000, headers = FEED_HEADERS } = {}) {
  let url = assertFeedUrl(value, allow).href;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchImpl(url, { redirect: 'manual', signal, headers });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (redirects === 3) throw new Error('Too many redirects');
      // 주소가 바뀌어도 등록된 도메인 안에서만 따라간다(워드프레스 /feed → /feed/ 등).
      url = assertFeedUrl(new URL(response.headers.get('location'), url).href, allow).href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > maxBytes) { await reader.cancel(); throw new Error('Source exceeds size limit'); }
      chunks.push(chunk);
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  }
  throw new Error('No response');
}

/** RSS(<item>) · Atom(<entry>) 둘 다. 제목 · 주소 · 발행일만 쓴다. */
function parseFeed(xml, source, capturedAt) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const name = plainText($('channel > title').first().text() || $('feed > title').first().text(), 70) || source.name || source.id;
  const nodes = $('item').length ? $('item').toArray() : $('entry').toArray();
  const posts = nodes.slice(0, MAX_POSTS_PER_FEED).map((el) => {
    const e = $(el);
    const link = e.find('link').first();
    const href = link.attr('href') || link.text();
    const url = postLink(href, source);
    const title = plainText(e.find('title').first().text(), 160);
    if (!url || !title) return null;
    const date = e.find('pubDate').first().text() || e.find('published').first().text() || e.find('updated').first().text() || e.find('dc\\:date').first().text();
    return { sourceId: source.id, name, category: source.category, grade: source.grade, title, url, publishedAt: validDate(date, capturedAt), capturedAt };
  }).filter(Boolean);
  return { name, posts };
}

/*
 * 소재 묶기 — 애드센스 제목의 공통어(실측: 엑셀 '최근 글 제목'에서 거의 모든 글에 붙는 말)는 겹쳐도 같은 소재 근거가 아니다.
 */
const PARTICLE = /(에서|으로|까지|부터|처럼|보다|에게|하는|하면|이란|이랑|과|와|의|이|가|은|는|을|를|도|만|로|에)$/;
const STOP = /^(신청|방법|조건|기간|대상|자격|총정리|정리|꿀팁|확인|안내|바로가기|사이트|홈페이지|최신|지원|혜택|금액|대해|알아보기|알아보자|하는법|방법은|어디서|언제|얼마|얼마나|무엇|누가|가능|필수|이유|후기|추천|비교|순위|조회|계산|계산기|기준|변경|변경사항|달라진|달라지는|새로|오늘|지금|이번|올해|내년|최대|최소|무료|정보|모음|총|완벽|가이드|팁|체크|체크리스트|주의|주의사항|방식|절차|서류|준비|준비물|일정|시기|날짜|지급일|발표|결과|공고|모집|접수)$/;
const isNumberWord = (t) => /^\d/.test(t);
/*
 * 첫 실수집(2026-10-07, 7일 글 7,782건) 오묶음에서 뽑았다: '받을 수 있을까'만 겹친 장학금 · 실업급여 · 장애인연금,
 * '우리 집에 맞는'만 겹친 장판 · TV, '세액공제 한도'만 겹친 서로 다른 공제. 동사 · 형용사 꼴과 범용 명사는 소재 근거가 아니다.
 */
const VERBISH = /(을까|ㄹ까|까요|나요|세요|는지|는데|던|할|될|있을|없을|받을|맞는|하는|되는|있는|없는|좋은|쉬운|다른|같은|받는|하기|되기|보기|하고|해서|하면|되면|이고|인가|일까)$/;
const GENERIC = new Set(['우리', '종류', '선택법', '사용법', '이용법', '해결법', '한도', '공제', '장단점', '차이', '차이점', '뜻', '의미', '요약', '포인트', '시행', '업데이트', '실시간', '누구', '누구나', '모두', '전부', '쉽게', '간단', '간단히', '제대로', '빠르게', '꼭', '볼', '뉴스', '소식', '최근', '현재', '변화', '전략', '활용', '활용법', '관리', '관리법', '효과', '부작용', '증상', '원인', '해결', '대처', '대처법',
  // 2차 실수집: '윈도우 + 설정', '고객센터 전화번호 상담원 연결'만 겹쳐 서로 다른 회사 · 기능이 한 카드가 됐다.
  // 3차(사장님 스크린샷): '거절 사유'만 겹쳐 비상금대출 · 네이버페이 환불 · 금리인하요구권이 한 카드.
  '거절', '사유', '방안', '대안', '대응', '해결책', '해결방법', '가지', '정리본', '설정', '고객센터', '전화번호', '상담원', '상담', '연결', '운영시간', '영업시간', '다운로드', '설치', '사용', '예약', '예매', '입장료', '주차장', '주차', '가격', '요금', '할인', '쿠폰', '코드', '로그인', '앱', '어플', '양식', '발급', '재발급', '해지', '가입', '갱신', '등록', '문의', '주소', '위치', '배송', '반품', '환불', '접수', '처리', '사용처', '총액', '계좌', '카드', '은행', '보험', '대출', '이자', '금리', '수수료',
  // 4차(재수집 표본): '실전'만 겹친 설악산 케이블카 ↔ PC 모니터 케이블, '비용'만 겹친 임플란트 ↔ 당뇨 검사.
  '실전', '비용', '시세', '평균', '점검', '혼잡']);

function topicTokens(title) {
  return [...new Set(plainText(title, 160)
    .replace(/["'“”‘’!?.,()[\]{}<>…·:;|/\\~\-–—+=#*&^%$@]/g, ' ')
    .split(/\s+/)
    .map((t) => t.toLowerCase().replace(/[^가-힣a-z0-9]/g, ''))
    .map((t) => (t.length >= 3 && PARTICLE.test(t) ? t.replace(PARTICLE, '') : t))
    .filter((t) => t.length >= 2 && !isNumberWord(t) && !STOP.test(t) && !VERBISH.test(t) && !GENERIC.has(t)))];
}

function sharedUnits(a, b) {
  const units = new Set();
  for (const t of a) for (const u of b) {
    if (t === u) units.add(t);
    else if (t.length >= 3 && u.length >= 3 && (t.includes(u) || u.includes(t))) units.add(t.length <= u.length ? t : u);
  }
  return [...units];
}

/** 같은 소재 — 공통어를 뺀 구체어가 둘 이상 겹치고, 겹친 말이 짧은 쪽의 절반 이상. 구체어가 하나뿐인 짧은 제목은 그 하나가 4자 이상 같을 때. */
function sameTopic(a, b) {
  if (!a.length || !b.length) return false;
  const units = sharedUnits(a, b);
  const ratio = units.length / Math.min(a.length, b.length);
  if (units.length >= 2 && ratio >= 0.5) return true;
  return Math.min(a.length, b.length) === 1 && units.some((u) => u.length >= 4);
}

const bigrams = (t) => { const out = []; for (let i = 0; i + 1 < t.length; i += 1) out.push(t.slice(i, i + 2)); return out; };

/** 7일 글이 1만 건을 넘을 수 있어 전부와 견주지 않는다 — 낱말 두 글자 조각이 겹치는 묶음만 후보로 본다(홈판 묶기와 같은 색인). */
function groupPosts(posts) {
  const groups = [];
  const seenUrl = new Set();
  const byGram = new Map();
  for (const p of posts) {
    if (seenUrl.has(p.url)) continue;
    seenUrl.add(p.url);
    const terms = topicTokens(p.title);
    const candidates = new Set();
    for (const t of terms) for (const g of bigrams(t)) for (const i of byGram.get(g) || []) candidates.add(i);
    let index = -1;
    for (const i of [...candidates].sort((a, b) => a - b)) if (sameTopic(terms, groups[i].terms)) { index = i; break; }
    if (index < 0) {
      index = groups.length;
      groups.push({ terms, posts: [] });
      for (const t of terms) for (const g of new Set(bigrams(t))) { if (!byGram.has(g)) byGram.set(g, []); byGram.get(g).push(index); }
    }
    groups[index].posts.push(p);
  }
  return groups;
}

/*
 * 분야 — 글 제목 내용으로 매긴다(2026-10-07 사장님 지적: '뷰티·패션' 칩에 '비상금대출 거절 사유'). 예전엔 블로그(엑셀) 분야
 * 다수결이라, 뷰티 블로그가 쓴 대출 글이 뷰티가 됐다. 엑셀의 20분야 이름 그대로 쓴다. 위에서부터 먼저 맞는 단서가 이기도록
 * 좁은 분야(자동차보험 → 자동차, 연말정산 → 세금, 국민연금 → 복지)를 넓은 분야(금융)보다 앞에 둔다. 단서가 없으면 블로그 분야 다수결.
 */
const CATEGORY_RULES = [
  ['자동차', /자동차|차량|통행료|고속도로|불법주차|전기차|하이브리드|신차|중고차|운전면허|운전|타이어|주유|하이패스|블랙박스|SUV|현대차|기아\b|제네시스|테슬라|그랜저|쏘렌토|카니발/],
  ['세금·행정·법률', /개인회생|파산|채무|채권추심|신용회복|세금|세액|연말정산|종합소득세|종소세|부가세|부가가치세|재산세|취득세|양도세|상속|증여|과태료|범칙금|민원|등본|초본|인감|신고서|변호사|소송|고소|법원|판결|법률|위자료|이혼/],
  ['부동산', /디딤돌|버팀목|보금자리론|청약|전세|월세|아파트|분양|임대주택|부동산|재건축|재개발|매매|공시가격|LH|SH|오피스텔|주택담보/],
  ['정부지원금·복지', /피부양자|건보료|건강보험료|지원금|장려금|바우처|수당|기초연금|국민연금|노령연금|장애인연금|실업급여|구직급여|복지|보조금|지원사업|장학금|에너지바우처|긴급지원|생계급여|주거급여|청년도약|청년미래|청년.{0,4}(지원|월세|적금|계좌)|지역화폐|민생/],
  ['다이어트·운동', /다이어트|체중|살빼|운동법|헬스|러닝|요가|필라테스|칼로리|식단/],
  ['건강·의학', /증상|질환|질병|병원|약국|처방|복용|부작용|예방접종|백신|독감|코로나|건강검진|혈압|혈당|당뇨|고지혈|콜레스테롤|암\b|치료|통증|영양제|비타민|수면|두통|탈모|임플란트|치과|진료|수술|이비인후|청력|안과|한의원|검사/],
  ['육아·교육', /육아|아기|신생아|어린이|유치원|어린이집|초등|중학|고등학교|입시|수능|학원|교육비|출산|임신|아동/],
  ['취업·자격증', /워크넷|고용24|구직|구인|취업|자격증|채용|공무원|면접|이력서|자소서|토익|합격|필기|실기|국가고시|시험\s*일정/],
  ['반려동물', /강아지|고양이|반려견|반려묘|반려동물|펫|사료|동물병원/],
  ['음식·레시피', /레시피|요리|만드는\s*법|만들기|반찬|김치|볶음|찌개|국\s*끓|간식|밀키트/],
  ['여행·맛집', /여행|맛집|축제|단풍|벚꽃|호텔|숙소|펜션|항공권|마일리지|공항|캠핑|관광|가볼만한|입장료|모노레일|숲|해수욕장|리조트/],
  ['스포츠·게임·취미', /축구|야구|농구|배구|골프|테니스|올림픽|아시안게임|월드컵|대표팀|A매치|선수|경기|게임|리그|낚시/],
  ['연예·드라마·이슈', /드라마|배우|가수|아이돌|방송|예능|출연|열애|컴백|시청률|영화|OTT|넷플릭스|디즈니|티빙|웨이브|쿠팡플레이|왓챠|논란|프로필/],
  ['뷰티·패션', /화장품|피부(?!양자)|스킨케어|선크림|헤어|염색|패션|코디|네일|향수|립스틱|쿠션|옷차림/],
  ['IT·테크·AI', /윈도우|아이폰|갤럭시|안드로이드|노트북|컴퓨터|PC|엑셀|파워포인트|한글\s*파일|챗GPT|ChatGPT|AI|인공지능|카카오톡|카톡|앱\b|어플|오류|업데이트|와이파이|블루투스|프린터/],
  ['블로그·부업·마케팅', /블로그|애드센스|부업|N잡|스마트스토어|쿠팡파트너스|마케팅|수익화|유튜브\s*수익/],
  ['금융·재테크', /대출|금리|적금|예금|주식|ETF|코인|비트코인|연금저축|IRP|ISA|신용카드|체크카드|카드\s*혜택|보험|환율|금값|금\s*시세|투자|신용점수|이자|통장|펀드|배당|증권|은행|실적|주가|공모주|코스피|코스닥|네이버페이|토스|카카오페이|포인트|환급/],
  ['생활정보·꿀팁', /고객센터|전화번호|청소|세탁|분리수거|생활|꿀팁|정리법|택배|우편|도시가스|가스요금|가스비|전기요금|수도요금|관리비|난방|전기요|이불|침구/],
  ['쇼핑·제품리뷰', /선물|최저가|가성비|구매|직구|할인|쿠폰|리뷰|언박싱|추천\s*(제품|템)/],
];

function categoryOfTitle(title) {
  for (const [name, re] of CATEGORY_RULES) if (re.test(title)) return name;
  return null;
}

/** 제목마다 분야를 매겨 다수결(같으면 앞 제목 쪽). 제목 전체를 이어 붙여 처음 걸리는 규칙을 고르면, 묶음 속 엉뚱한 글 한 편의 낱말이 이긴다. */
function categoryOf(titles, blogCategories) {
  const votes = new Map();
  for (const title of titles || []) { const c = categoryOfTitle(String(title || '')); if (c) votes.set(c, (votes.get(c) || 0) + 1); }
  if (votes.size) return [...votes.entries()].reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];
  const list = (blogCategories || []).filter(Boolean);
  if (!list.length) return '종합·기타';
  const counts = new Map();
  for (const c of list) counts.set(c, (counts.get(c) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

const GRADE_POINT = { S: 12, A: 8, B: 4, C: 0 };

function toCard(group, now) {
  const sorted = [...group.posts].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  const lead = sorted[0];
  const blogs = new Set(sorted.map((p) => p.sourceId));
  const channels = blogs.size;
  const age = lead.publishedAt ? (Date.parse(now) - Date.parse(lead.publishedAt)) / DAY : WINDOW_DAYS;
  const bestGrade = ['S', 'A', 'B', 'C'].find((g) => sorted.some((p) => p.grade === g)) || 'C';
  // 분야는 대표 글 제목 먼저(단서가 가장 또렷), 없으면 묶인 글 제목 전체, 그래도 없으면 블로그 분야 다수결.
  const leadCategory = categoryOf([lead.title], []);
  const category = leadCategory !== '종합·기타' ? leadCategory : categoryOf(sorted.map((p) => p.title), sorted.map((p) => p.category));
  // ★ = 고수 블로그 3곳 이상(2026-10-07). 2곳 이상으로 잡았더니 7일 · 786곳에서 1,000장 중 794장이 ★ 였다 — 구분이 안 된다.
  const recommended = channels >= 3;
  const why = [lead.publishedAt ? `고수 블로그 발행 ${lead.publishedAt.slice(0, 10)}` : '발행일 미확인'];
  if (channels >= 2) why.push(`애드센스 고수 블로그 ${channels}곳이 최근 7일 안에 함께 다룬 소재`);
  return {
    id: crypto.createHash('sha256').update(lead.url).digest('hex').slice(0, 16),
    keyword: group.terms.slice(0, 5).join(' ').slice(0, 55) || lead.title.slice(0, 55),
    title: lead.title,
    category,
    grade: bestGrade,
    recommended,
    priority: Math.max(0, Math.min(40, (channels - 1) * 10) + GRADE_POINT[bestGrade] + (age <= 1 ? 10 : age <= 3 ? 6 : 2)),
    publishedAt: lead.publishedAt,
    capturedAt: lead.capturedAt,
    why,
    // 실측은 다음 단계(검색량 · 문서수 · 파워링크 입찰가)가 채운다. 지어내지 않는다.
    metrics: { searchVolume: null, documentCount: null, bid: null },
    // 제목은 템플릿으로 채우지 않는다 — 제목 단계가 카드마다 검색용 제목을 얹는다.
    titles: [],
    sources: sorted.slice(0, 6).map((p) => ({ id: p.sourceId, name: p.name, grade: p.grade, category: p.category, title: p.title, url: p.url, publishedAt: p.publishedAt })),
  };
}

/** 고수 제목 모양 — 실제 제목에서 센다(길이 중앙값 · 연도 · 숫자 · 물음표 · 괄호 비율). */
function titleShape(posts) {
  const titles = posts.map((p) => plainText(p.title, 160)).filter(Boolean);
  const n = titles.length;
  if (!n) return { count: 0, lengthMedian: null, yearPct: null, numberPct: null, questionPct: null, bracketPct: null };
  const pct = (re) => Math.round((titles.filter((t) => re.test(t)).length / n) * 100);
  const lengths = titles.map((t) => [...t].length).sort((a, b) => a - b);
  return {
    count: n,
    lengthMedian: lengths[Math.floor((n - 1) / 2)],
    yearPct: pct(/20\d\d/),
    numberPct: pct(/\d/),
    questionPct: pct(/\?|까$|나요|을까|ㄹ까/),
    bracketPct: pct(/[[\](){}【】]/),
  };
}

/*
 * 철 지난 명절 · 기념일 소재(2026-10-07 사장님 "추석 지났는데도 추석 민생지원금을 쓰는 사람이 있는가").
 * 고수가 10-06 에 썼어도 독자는 이미 지나간 명절을 찾지 않는다. 명절 앞 45일 ~ 끝난 뒤 사흘만 살린다.
 * 음력 명절 날짜는 두 곳 이상 검색으로 맞춘 값(2026-10-07). 표에 앞으로 올 날짜가 없으면(표가 낡으면) 거르지 않는다 — 다 버리는 것보다 낫다.
 */
const EVENT_LEAD_DAYS = 45;
const EVENT_GRACE_DAYS = 3;
const LUNAR_EVENTS = [
  { re: /추석|한가위/, windows: [['2026-09-24', '2026-09-27'], ['2027-09-14', '2027-09-16']] },
  { re: /설날|설\s*(연휴|명절|선물|인사)|구정/, windows: [['2027-02-06', '2027-02-09']] },
];
const FIXED_EVENTS = [
  { re: /크리스마스|성탄절/, md: '12-25' }, { re: /어린이날/, md: '05-05' }, { re: /어버이날/, md: '05-08' }, { re: /스승의\s*날/, md: '05-15' },
  { re: /빼빼로\s*데이/, md: '11-11' }, { re: /할로윈|핼러윈/, md: '10-31' }, { re: /화이트\s*데이/, md: '03-14' }, { re: /발렌타인|밸런타인/, md: '02-14' },
];

function isOffSeasonTitle(title, now) {
  const nowMs = Date.parse(now);
  const year = new Date(nowMs).getUTCFullYear();
  const active = (windows) => windows.some(([start, end]) => nowMs >= Date.parse(`${start}T00:00:00+09:00`) - EVENT_LEAD_DAYS * DAY && nowMs <= Date.parse(`${end}T23:59:59+09:00`) + EVENT_GRACE_DAYS * DAY);
  for (const { re, windows } of LUNAR_EVENTS) {
    if (!re.test(title)) continue;
    const covered = windows.some(([start]) => Date.parse(`${start}T00:00:00+09:00`) > nowMs);
    if (covered && !active(windows)) return true;
  }
  for (const { re, md } of FIXED_EVENTS) {
    if (!re.test(title)) continue;
    if (!active([year - 1, year, year + 1].map((y) => [`${y}-${md}`, `${y}-${md}`]))) return true;
  }
  return false;
}

function buildBoard(results, sources, now, { maxCards = MAX_CARDS, windowDays = WINDOW_DAYS } = {}) {
  const nowMs = Date.parse(now);
  const posts = results.flatMap((r) => (r.status === 'ok' ? r.posts : []))
    .filter((p) => p.publishedAt && nowMs - Date.parse(p.publishedAt) <= windowDays * DAY && Date.parse(p.publishedAt) <= nowMs + 300000);
  const allCards = groupPosts(posts).map((g) => toCard(g, now));
  const inSeason = allCards.filter((c) => !isOffSeasonTitle(c.title, now));
  const candidates = inSeason
    .sort((a, b) => Number(b.recommended) - Number(a.recommended) || b.priority - a.priority || (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0) || a.id.localeCompare(b.id))
    .slice(0, maxCards);
  const meta = new Map((sources || []).map((s) => [s.id, s]));
  const byCategory = new Map();
  for (const p of posts) {
    const c = byCategory.get(p.category) || { category: p.category, posts: 0, blogs: new Set() };
    c.posts += 1; c.blogs.add(p.sourceId); byCategory.set(p.category, c);
  }
  return {
    schemaVersion: 1,
    scope: 'adsense-benchmark',
    attemptedAt: now,
    generatedAt: posts.length ? now : null,
    status: posts.length ? (results.every((r) => r.status === 'ok') ? 'fresh' : 'partial') : 'stale',
    windowDays,
    sourceCount: results.length,
    okCount: results.filter((r) => r.status === 'ok').length,
    collectedPostCount: posts.length,
    sources: results.map((r) => ({ id: r.id, name: meta.get(r.id)?.name || r.id, category: meta.get(r.id)?.category || '', grade: meta.get(r.id)?.grade || '', status: r.status, postCount: r.posts ? r.posts.length : 0, ...(r.error ? { error: String(r.error).slice(0, 80) } : {}) })),
    offSeasonDropped: allCards.length - inSeason.length,
    candidates,
    trends: {
      categories: [...byCategory.values()].map((c) => ({ category: c.category, posts: c.posts, blogs: c.blogs.size })).sort((a, b) => b.posts - a.posts),
      titleShape: titleShape(posts),
    },
  };
}

module.exports = { categoryOf, isOffSeasonTitle, PLAIN_HEADERS, buildAllowlist, assertFeedUrl, postLink, fetchFeed, parseFeed, topicTokens, sameTopic, groupPosts, titleShape, buildBoard, MAX_CARDS, WINDOW_DAYS };
