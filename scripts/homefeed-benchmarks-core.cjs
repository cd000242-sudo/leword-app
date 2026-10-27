'use strict';
const cheerio = require('cheerio');
const crypto = require('node:crypto');

const DAY = 86400000;
const FETCH_PATHS = {
  'rss.blog.naver.com': /^\/[a-zA-Z0-9_-]+\.xml$/,
  'www.youtube.com': /^\/(?:@[a-zA-Z0-9_-]+|feeds\/videos\.xml)$/,
  'www.issuelink.co.kr': /^\/community\/listview\/all\/24\/comment\/_blank\/?$/,
  'news.nate.com': /^\/rank\/emoticon$/,
  // 블로그 글 공감 수(여러 글 한 번에) — 반응 상승을 재려고 쓴다(2026-10-01).
  'blog.like.naver.com': /^\/v1\/search\/contents$/,
};
// 인스타는 fetchText 로 읽지 않는다(FETCH_PATHS 에 없음) — Bright Data 레코드의 게시물 주소만 링크로 허용한다.
const LINK_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com', 'www.youtube.com', 'www.issuelink.co.kr', 'news.nate.com', 'www.instagram.com']);
function assertFetchUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !FETCH_PATHS[url.hostname]?.test(url.pathname)) throw new Error('Blocked source URL');
  return url;
}
function safeLink(value, base) {
  try {
    const u = new URL(value, base);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !LINK_HOSTS.has(u.hostname)) return null;
    const postPaths = { 'blog.naver.com': /^\/[a-zA-Z0-9_-]+\/\d+$/, 'm.blog.naver.com': /^\/[a-zA-Z0-9_-]+\/\d+$/, 'www.youtube.com': /^\/watch$/, 'www.issuelink.co.kr': /^\/community\/go\/[a-zA-Z0-9_-]+\/\d+$/, 'news.nate.com': /^\/view\/\d{8}n\d+$/, 'www.instagram.com': /^\/(?:p|reel)\/[a-zA-Z0-9_-]+\/?$/ };
    if (!postPaths[u.hostname].test(u.pathname)) return null;
    if (u.hostname==='www.youtube.com' && !/^[a-zA-Z0-9_-]{11}$/.test(u.searchParams.get('v')||'')) return null;
    for (const key of [...u.searchParams.keys()]) if (key !== 'v') u.searchParams.delete(key);
    u.hash = ''; return u.href;
  } catch { return null; }
}
async function fetchText(value, { fetchImpl = fetch, maxBytes = 4000000, timeoutMs = 18000 } = {}) {
  let url = assertFetchUrl(value).href;
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= 2; redirects++) {
    const response = await fetchImpl(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'LEWORD-PublicBenchmark/1.0', Accept: 'text/html,application/rss+xml,application/atom+xml;q=0.9,application/json;q=0.8' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      if (redirects === 2) throw new Error('Too many redirects');
      url = assertFetchUrl(new URL(response.headers.get('location'), url).href).href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Source exceeds size limit'); }
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (true) { const { done, value: chunk } = await reader.read(); if (done) break; size += chunk.length; if (size > maxBytes) { await reader.cancel(); throw new Error('Source exceeds size limit'); } chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    const header = response.headers.get('content-type') || '';
    const charset = (header.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || bytes.subarray(0,2000).toString('ascii').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
    return new TextDecoder(['euc-kr', 'ks_c_5601-1987', 'cp949'].includes(charset) ? 'euc-kr' : 'utf-8').decode(bytes);
  }
  throw new Error('No response');
}
function plainText(value, length = 300) {
  const $ = cheerio.load(String(value || '')); $('script,style,iframe,object,svg').remove();
  return $.text().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, length);
}
function serialize(value) { return JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
function validDate(value, now) { if (!value) return null; const ms = Date.parse(value); return Number.isFinite(ms) && ms <= Date.parse(now) + 300000 ? new Date(ms).toISOString() : null; }
function count(value) { const text = String(value || '').replace(/,/g, '').trim(); return /^\d+$/.test(text) ? Number(text) : null; }
function basePost(source, capturedAt, data) { return { sourceId: source.id, platform: source.platform, name: plainText(source.name || source.id, 70), topic: source.topic || null, eventAt: null, capturedAt, metrics: { views: null, likes: null, comments: null }, ...data }; }
/**
 * 원문 대표 이미지(2026-10-22 사장님 "이미지도 같이 볼 수 있게") — 화면은 리퍼러 없이 불러온다(네이버는 다른 사이트 리퍼러면 403, 실측).
 * 네이버 이미지 서버 · 유튜브 썸네일의 https 주소만 받는다 — 다른 서버 주소는 버린다.
 */
const IMAGE_HOST = /^https:\/\/([a-z0-9-]+\.)*(pstatic\.net|ytimg\.com)\//i;
function safeImage(value) { const url = String(value || '').trim(); return IMAGE_HOST.test(url) && url.length <= 600 ? url : null; }
function firstImage(html) { const m = /<img[^>]+src=["']([^"']+)["']/i.exec(String(html || '')); return m ? safeImage(m[1].replace(/&amp;/g, '&')) : null; }
function parseRss(xml, source, capturedAt) {
  const $ = cheerio.load(xml, { xmlMode: true }); const name = plainText($('channel > title').first().text(), 70) || source.id;
  const posts = $('item').toArray().slice(0, 20).map(el => { const e = $(el); const url = safeLink(e.find('link').first().text()); if (!url || !['blog.naver.com', 'm.blog.naver.com'].includes(new URL(url).hostname)) return null;
    const image = firstImage(e.find('description').text());
    return basePost({ ...source, name }, capturedAt, { title: plainText(e.find('title').first().text(), 160), url, publishedAt: validDate(e.find('pubDate').text(), capturedAt), summary: plainText(e.find('description').text(), 300), ...(image ? { image } : {}) });
  }).filter(p => p?.title);
  return { name, posts };
}
function parseYoutube(xml, source, capturedAt) {
  const $ = cheerio.load(xml, { xmlMode: true }); const name = plainText($('feed > title').first().text(), 70) || source.id;
  const posts = $('entry').toArray().slice(0, 15).map(el => { const e = $(el); const url = safeLink(e.find('link').attr('href')); if (!url) return null;
    return basePost({ ...source, name }, capturedAt, { title: plainText(e.find('title').first().text(),160), url, publishedAt: validDate(e.find('published').text(), capturedAt), summary: plainText(e.find('media\\:description').text(),300), ...(safeImage(e.find('media\\:thumbnail').attr('url')) ? { image: safeImage(e.find('media\\:thumbnail').attr('url')) } : {}), metrics: { views: count(e.find('media\\:statistics').attr('views')), likes: null, comments: null } });
  }).filter(p => p?.title); return { name, posts };
}
function parseCommunity(html, source, capturedAt) {
  const $ = cheerio.load(html); const seen = new Set(); const posts = [];
  $('a[href*="/community/go/"]').each((_, el) => { if (posts.length >= 50) return; const e = $(el); const url = safeLink(e.attr('href'), source.url); if (!url || seen.has(url)) return; seen.add(url);
    const row = e.closest('tr'); const comments = count(e.find('small').text().replace(/[\[\]]/g,'')); const title = plainText(e.clone().find('small').remove().end().text(),160);
    const date = row.find('.second_date span').first().text().trim();
    posts.push(basePost({ ...source, name: '이슈링크 · ' + plainText(row.find('td small').first().text(),20) }, capturedAt, { title, url, publishedAt: validDate(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(date) ? date.replace(' ','T') + '+09:00' : null, capturedAt), summary: '', metrics: { views: null, likes: null, comments }, metricNote: '집계 사이트에 표시된 원 커뮤니티 댓글 수. 홈판 유입 지표가 아닙니다.' }));
  }); return { name: '이슈링크 댓글순', posts };
}
function parseNate(html, source, capturedAt) {
  const $ = cheerio.load(html); const posts = []; const seen = new Set();
  $('a.lt1[href*="/view/"]').each((_, el) => { const e = $(el); const url = safeLink(e.attr('href'), source.url); if (!url || seen.has(url) || posts.length >= 30) return; seen.add(url);
    posts.push(basePost({ ...source, name: '네이트 연예 공감순' }, capturedAt, { title: plainText(e.find('.tit').text(),160), url, publishedAt: null, summary: plainText(e.find('.desc').text(),300), metrics: { views: null, likes: null, comments: null }, reactionLabel: plainText(e.find('.rnk-emotion .img').text(),30), reactionCount: count(e.find('.emcnt em').text()) }));
  }); return { name: '네이트 연예 공감순', posts: posts.filter(p => p.title && !p.title.includes('\ufffd')) };
}
/** Bright Data 인스타 레코드(homefeed-instagram.cjs 가 정규화한 풀) → 기준 게시물. 첫 줄이 제목, 좋아요·댓글이 지표. */
function parseInstagram(items, source, capturedAt) {
  const name = plainText(source.name || source.id, 70);
  const posts = (items || []).map(item => { const url = safeLink(item.url); if (!url) return null;
    const text = String(item.description || ''); const title = plainText(text.split(/\r?\n/).find(line => line.trim()) || '', 160);
    const summary = plainText(text, 300) + (item.paidPartnership ? ' [유료광고 파트너십 표시]' : '');
    return basePost({ ...source, name }, capturedAt, { title, url, publishedAt: validDate(item.datePosted, capturedAt), summary: summary.slice(0, 300), metrics: { views: Number.isFinite(item.views) ? item.views : null, likes: Number.isFinite(item.likes) ? item.likes : null, comments: Number.isFinite(item.comments) ? item.comments : null } });
  }).filter(p => p?.title);
  return { name, posts };
}
function reactionGrowth(current, previous) {
  if (!previous || previous.url !== current.url || previous.platform !== current.platform || Date.parse(current.capturedAt) - Date.parse(previous.capturedAt) < 60000) return null;
  const result = {};
  for (const key of ['views', 'likes', 'comments']) { const a = previous.metrics?.[key], b = current.metrics?.[key]; if (Number.isFinite(a) && Number.isFinite(b) && b >= a) result[key] = { change: b-a, elapsedMinutes: Math.round((Date.parse(current.capturedAt)-Date.parse(previous.capturedAt))/60000) }; }
  return Object.keys(result).length ? result : null;
}
/** 네이버 블로그 글 주소 → 공감 창구의 글 아이디('아이디_글번호'). 블로그 글이 아니면 null. */
function likeContentsId(url) {
  const m = String(url || '').match(/^https:\/\/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)$/);
  return m ? `${m[1]}_${m[2]}` : null;
}
/** 공감 창구 응답 → 글 아이디별 공감 합계(모든 반응 종류를 더한 값 — 블로그 화면의 '공감' 숫자). 모양이 아니면 빈 표. */
function parseLikes(json) {
  const out = new Map();
  for (const item of Array.isArray(json?.contents) ? json.contents : []) {
    if (!item || typeof item.contentsId !== 'string' || !Array.isArray(item.reactions)) continue;
    const total = item.reactions.reduce((sum, r) => sum + (Number.isFinite(r?.count) ? r.count : 0), 0);
    out.set(item.contentsId, total);
  }
  return out;
}
function normalized(title) { return plainText(title,160).toLowerCase().replace(/[^가-힣a-z0-9]/g,''); }
function tokens(title) { return [...new Set(plainText(title,160).replace(/["'“”‘’!?.,()[\]…]/g,' ').split(/\s+/).filter(s => s.length >= 2 && !/^(현재|지금|오늘|정리|이유|근황|화제|논란|확인|모음|후기|jpg|ㄷㄷ|ㅎㄷㄷ)/i.test(s)))]; }
/*
 * 소재 묶기용 낱말(2026-09-30). 실측: 판 30장이 전부 채널 1곳짜리였다 — '디올과 원영의 만남' 과
 * '디올원영 어떤데?' 가 조사·붙여쓰기 때문에 겹치는 낱말 0으로 갈렸다. 조사를 떼고, 날짜 숫자·
 * 계정 핸들·'인스타그램' 같은 공통어는 빼고, 붙여 쓴 말은 포함 관계로 겹침을 센다.
 */
const PARTICLE = /(에서|으로|까지|부터|처럼|보다|에게|한테|이랑|과|와|의|이|가|은|는|을|를|도|만|로|에)$/;
// 나라 이름 · 질문 틀('원작과 뭐가 다를까') · 시간 말은 소재가 아니다 — 실채널 첫 실행에서 이것들로 잘못 묶였다.
const GROUP_STOP = /^(인스타그램|인스타|유튜브|사진|영상|공개|광고|근황|소식|정리|이유|오늘|지금|현재|최근|진짜|요즘|결국|반응|한국|중국|일본|미국|해외|국내|한국인|한국인들|원작|뭐가|다를까|무슨|일이|있었나|이렇게|그동안|동안|만에|하루|벌써|드디어|생각|차이|어디|누구|얼마|알고|보니|이후|이제|다시|직접|모두|가장|처음|제일|이번|지난)$/;
function groupTokens(title) {
  return [...new Set(tokens(title)
    .map((t) => t.replace(/^#/, '').replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase())
    .map((t) => (t.length >= 3 && PARTICLE.test(t) ? t.replace(PARTICLE, '') : t))
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !/^[a-z0-9_.]{6,}$/.test(t) && !GROUP_STOP.test(t)))];
}
/*
 * 일반어 — 겹쳐도 같은 소재라는 근거가 못 되는 말(2026-10-01, 출처 188곳 첫 실수집의 오묶음에서 뽑았다:
 * '그랜저'+'정신', '얼굴' 하나로 다른 글이 한 카드가 됐다). 나이 · 순위 · 금액 같은 숫자 단위 말도 일반어다.
 */
const GENERIC = new Set(['패션', '스타일', '코디', '얼굴', '몸매', '미모', '비주얼', '연예인', '배우', '여배우', '남배우', '아이돌', '가수', '스타', '셀럽', '화보', '공항', '공항패션', '반전', '레전드', '충격', '대박', '난리', '정체', '방법', '후기', '정보', '추천', '비교', '가격', '신차', '출시', '발표', '사람들', '남자들', '여자들', '여자', '남자', '정신', '모습', '포인트', '느낌', '분위기', '매력', '인기', '순위', '역대', '최고', '최초', '완전', '하는', '되는', '있는', '없는', '보니', '같은', '이유가', '누구', '앞두고', '달라진', '몰라보게', '되더니', '했더니', '결혼', '명품', '가방', '명품백', '신상', '할인', '일정', '이벤트']);
const isGeneric = (token) => GENERIC.has(token) || /^\d{1,2}(대|세|살)$/.test(token) || /^\d+(위|명|개|원|만원|천만원|억|억원|km|%)$/.test(token);
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
  return specific >= 2 && ratio >= 0.5;
}
/**
 * 분야(2026-10-01 사장님 "자동차 IT 는 안 보여") — 제목 단서가 먼저, 없으면 출처 블로그 주제(운영자가 목록에 적은 구역)의 다수결,
 * 그것도 없으면 사회·이슈. 예전엔 제목 단서만 봐서 자동차 · IT 분야가 아예 없었고 판 300장 중 225장이 사회·이슈였다.
 * 규칙은 사이트 homefeedLive.mjs 와 같아야 한다(같은 사례를 양쪽 테스트가 잠갔다).
 */
const TOPIC_CATEGORY = { 'IT/차테크': '자동차·IT', 'IT·컴퓨터': '자동차·IT', '자동차': '자동차·IT', '재테크 라이프': '생활경제·주거', '비즈니스·경제': '생활경제·주거', '연예인 패션': '패션·뷰티', '패션·미용': '패션·뷰티', '미용·패션': '패션·뷰티', '방송 이슈': '문화·연예', '방송': '문화·연예', '드라마': '문화·연예', '스타·연예인': '문화·연예', '스포츠': '스포츠·게임', '건강 상식': '건강', '건강·의학': '건강', '리빙 라이프': '여행·생활', '인테리어·DIY': '여행·생활', '요리·레시피': '여행·생활', '맛집': '여행·생활', '육아·결혼': '여행·생활' };
const CATEGORY_PATTERNS = [
  ['생활경제·주거', /전세|주택|아파트|대출|지원금|연금|세금|청약|금리|부동산|소상공인|보조금|저축/],
  ['자동차·IT', /자동차|신차|전기차|하이브리드|SUV|세단|차량|운전|주차|과태료|벌점|깜빡이|타이어|연비|현대차|기아(?!\s*타이거즈)|제네시스|테슬라|벤츠|BMW|아우디|그랜저|쏘렌토|카니발|아이오닉|스마트폰|아이폰|갤럭시|노트북|태블릿|인공지능|챗GPT|요금제|통신사/],
  ['건강', /건강|다이어트|위고비|비만|혈압|혈당|당뇨|콜레스테롤|영양제|비타민|검진|위암|유방암|폐암|갑상선|두통|불면/],
  ['패션·뷰티', /패션|코디|착장|가방|샤넬|데님|세럼|화장품|여행룩/],
  ['여행·생활', /여행|숙소|호텔|런던|공항|맛집|날씨|교통/],
  ['스포츠·게임', /야구|축구|선수|아시안게임|올림픽|게임|메달|홈런|손흥민|이강인|김민재|A매치|월드컵|국가대표|K리그|EPL|프리킥|득점|결승골|선제골|\d+호골|골프|농구|배구/],
  ['문화·연예', /배우|가수|아이돌|방송|드라마|영화|콘서트|아이브|카즈하|고윤정|카리나|트로트/],
];
function category(title, topics = [], summary = '') {
  for (const [name, pattern] of CATEGORY_PATTERNS) if (pattern.test(title)) return name;
  // 제목에 없으면 요약에서(2026-10-08) — 요약이 있는데 단서가 없으면 블로그 주제를 믿지 않는다(여러 주제를 쓰는 블로그: 차범근 · 부캉이 · 마케팅 글이 IT/차테크로 갔다)
  for (const [name, pattern] of CATEGORY_PATTERNS) if (pattern.test(String(summary || ''))) return name;
  if (String(summary || '').trim()) return '사회·이슈';
  const counts = new Map();
  for (const topic of topics) { const name = TOPIC_CATEGORY[topic]; if (name) counts.set(name, (counts.get(name) || 0) + 1); }
  let best = null;
  for (const [name, n] of counts) if (!best || n > best[1]) best = [name, n];
  return best ? best[0] : '사회·이슈';
}
function flagsFor(post, now) {
  const text = `${post.title} ${post.summary}`; const flags = [];
  if (/무상.{0,12}제공|제공.{0,8}받|협찬|소정의.{0,6}수수료|유료광고|원고료/.test(text)) flags.push('sponsored');
  const match = post.title.match(/^(\d{6}|20\d{6})(?:\s|[^0-9])/); let titleDate = null;
  if (match) { const s = match[1].length === 6 ? '20'+match[1] : match[1]; titleDate = validDate(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00+09:00`,now); }
  if ((titleDate && Date.parse(now)-Date.parse(titleDate)>7*DAY) || /과거.{0,12}(방송|사진|고백)|재조명|추억의|지난\s*20(?:1\d|2[0-5])년/.test(text)) flags.push('recycled-material');
  if (/불륜|외도|성폭행|사기꾼|정신병|정신병원|테러|자살|자해|양육비|법정\s*전쟁|고소|고발|이혼/.test(text)) flags.push('sensitive-claim');
  if (!post.publishedAt) flags.push('publication-date-unknown');
  if (!post.summary) flags.push('headline-only');
  return flags;
}
/*
 * 소재 묶기 — 결과는 예전(모든 묶음을 차례로 훑던 방식)과 같고 속도만 다르다(2026-10-01).
 * 출처 188곳 · 게시물 2천 개에서 예전 방식은 96초가 걸렸다: 비교할 때마다 제목을 다시 풀었고(normalized → cheerio)
 * 모든 묶음과 견줬다. 이제 게시물마다 한 번만 풀고, 같은 주소 · 같은 제목은 표로 찾고, 같은 소재 후보는
 * 두 글자 조각을 하나라도 나눠 가진 묶음만 견준다(겹침 · 포함 관계는 반드시 두 글자 조각을 나눠 갖는다).
 * '먼저 만든 묶음이 이긴다'는 예전 규칙을 그대로 지키려고 후보를 만든 순서대로 본다.
 */
/*
 * 판에 싣는 카드 상한. 2026-10-06 출처 786곳에서 카드 5,284장 · 추천 791장(실측) — 300장이면 추천 491장이 잘렸다.
 * 1,000장이면 추천은 전부 들어가고 판은 약 5MB(장당 5.2KB). 사이트 homefeedLive.mjs MAX_CARDS · 화면 모델 상한과 같이 바꿀 것.
 */
const MAX_CARDS = 1000;
function bigrams(token) { const out = []; for (let i = 0; i + 1 < token.length; i += 1) out.push(token.slice(i, i + 2)); return out; }
function groupPosts(posts) {
  const groups = []; const byUrl = new Map(); const byNorm = new Map(); const byGram = new Map();
  const remember = (map, key, index) => { if (!map.has(key)) map.set(key, index); };
  for (const post of posts.filter(p => p.title && safeLink(p.url) && !/ㅇㅎ[)\s]|후방주의|여캠시절|노출사진/.test(p.title))) {
    const norm = normalized(post.title); const terms = groupTokens(post.title);
    const exact = [byUrl.get(post.url), byNorm.get(norm)].filter((i) => i !== undefined);
    let index = exact.length ? Math.min(...exact) : -1;
    if (index < 0 && terms.length >= 2) {
      const seen = new Set();
      for (const t of terms) for (const g of bigrams(t)) for (const i of byGram.get(g) || []) seen.add(i);
      for (const i of [...seen].sort((a, b) => a - b)) if (sameStory(terms, groups[i].terms)) { index = i; break; }
    }
    if (index >= 0) {
      const group = groups[index];
      // 예전 규칙과 같게 — 같은 주소가 이미 있으면 넣지 않고, 넣지 않은 게시물의 제목은 표에 올리지 않는다.
      if (!group.urls.has(post.url)) { group.posts.push(post); group.urls.add(post.url); group.norms.set(post, norm); remember(byUrl, post.url, index); remember(byNorm, norm, index); }
    } else {
      index = groups.length;
      groups.push({ posts: [post], terms, urls: new Set([post.url]), norms: new Map([[post, norm]]) });
      for (const t of terms) for (const g of new Set(bigrams(t))) { if (!byGram.has(g)) byGram.set(g, []); byGram.get(g).push(index); }
      remember(byUrl, post.url, index); remember(byNorm, norm, index);
    }
  }
  return groups;
}
/*
 * 홈판 상위 이력(2026-10-27 실측) — 어드바이저 홈판 상위 381편 × 판 원문 28,574편 대조에서 가장 강한 신호.
 * 블로그별 상위 횟수(data/homefeed-top-blogs.json)를 받아, 추천은 "출처 블로그 상위 이력 1회+ 또는 공감 10+" 를 더 요구한다.
 * 이력이 비어 있으면(파일 없음) 예전 규칙 그대로다.
 */
const blogIdOf = (url) => (/blog\.naver\.com\/([A-Za-z0-9_-]+)/.exec(String(url || '')) || [])[1]?.toLowerCase() || null;
/*
 * 일반인 논란 · 사건(2026-10-27 비평 5번). 연애 예능 일반인 출연자의 불화 · 폭로 · 결별, 일반인이 얽힌 범죄는 추천하지 않는다 —
 * 판을 보는 초보자가 실존 일반인을 단정하는 글을 쓰게 되면 허위조작정보 위험이 크다. 출처 제목까지 보면 오탐이 늘어(데이트 공개 카드가 걸림)
 * 대표 글 제목 · 요약만 본다. '살인 태클' 같은 비유는 뺀다. 사이트 homefeedLive.mjs 와 같아야 한다.
 */
const REALITY_SHOW = /나는\s*솔로|나솔|나는\s*solo|솔로지옥|환승연애|하트시그널|돌싱글즈|커플팰리스|연애남매|끝사랑|모태솔로|합숙맞선/i;
const PRIVATE_DISPUTE = /불화|왕따|저격|폭로|유출|해명|갑질|학폭|사생활|열애설|결별|파혼|위장|의혹|루머|비난|악플|뒷담|논란/;
const PRIVATE_CRIME = /살인(?!\s*(태클|미소|일정|스케줄|더위))|살해|폭행|성폭|성추행|성범죄|스토킹|학대|가스라이팅|피해자|가해자|신상\s*공개|흉기|납치/;
function privatePersonRisk(post) {
  const text = `${post.title} ${post.summary || ''}`;
  return (REALITY_SHOW.test(text) && PRIVATE_DISPUTE.test(text)) || PRIVATE_CRIME.test(text);
}
/*
 * 같은 소재는 추천 3장까지(2026-10-27 비평 5번 — 나는솔로 43장이 판을 덮었다). 판을 보는 사람끼리 같은 소재로 겨루지 않게 한다.
 * 우선순위가 높은 추천부터 보고, 구체어 둘 이상을 나눠 가진 추천이 이미 3장이면 추천에서 뺀다(카드는 판에 남는다).
 * 묶기보다 느슨한 비교라 '입고 · 줄거리 · 드레스' 같은 말은 따로 뺐다 — 10/27 판 추천 329장 모의에서 이 말들로 다른 소재가 엮였다.
 */
const SAME_STORY_CAP = 3;
const CAP_STOP = new Set(['입고', '입은', '맞아', '이미', '나온', '찍은', '똑같', '똑같은', '남긴', '꺼낸', '드레스', '원피스', '가을', '겨울', '총정리', '줄거리', '결말', '해석', '결말해석', '출연진', '등장인물', '드라마', '영화', '리뷰', '등장', '다들', '너무', '이게', '대신', '마음', '사람', '엄마', '팬들', '평점', '원작', '재방송', '예고', '시청률', '근황', '사복', '사복패션', '주가', '전망']);
const storyKeys = (title) => groupTokens(title).map((t) => (/^(나솔|나는솔|나는솔로|나는solo)$/.test(t) ? '나는솔로' : t)).filter((t) => !CAP_STOP.has(t));
function capSameStory(cards) {
  const kept = [];
  return cards.map((card) => {
    if (!card.recommended) return card;
    const keys = storyKeys(card.title);
    const same = kept.filter((other) => sharedUnits(keys, other).filter((u) => !isGeneric(u)).length >= 2).length;
    if (same < SAME_STORY_CAP) { kept.push(keys); return card; }
    return { ...card, recommended: false, status: card.status === 'review-now' ? 'verify' : card.status, freshnessLabel: card.status === 'review-now' ? '원출처 확인 필요' : card.freshnessLabel, why: [...card.why, `같은 소재 추천이 이미 ${SAME_STORY_CAP}장 있어 추천에서 뺐습니다 — 판을 보는 사람끼리 같은 소재로 겨루지 않게.`] };
  });
}
const byBoardOrder = (a, b) => Number(b.recommended)-Number(a.recommended) || b.priority-a.priority || (Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0) || a.sources[0].url.localeCompare(b.sources[0].url);
function buildCandidates(posts, now, previousPosts = [], topBlogs = new Map()) {
  const measured = topBlogs instanceof Map && topBlogs.size > 0;
  const topsOf = (p) => (measured ? topBlogs.get(blogIdOf(p.url)) || 0 : 0);
  const groups = groupPosts(posts);
  // 이전 관측은 주소로 찾는다(같은 주소가 여럿이면 먼저 것 — 예전 find 와 같다).
  const prevByUrl = new Map(); for (const prev of previousPosts) if (prev && prev.url && !prevByUrl.has(prev.url)) prevByUrl.set(prev.url, prev);
  // A community headline alone is a discovery signal, not an adequately sourced writing brief.
  const ordered = groups.filter(group=>group.posts.some(p=>p.platform!=='community-ranking' && p.summary)).map(group => {
    const sorted = [...group.posts].sort((a,b) => Number(Boolean(b.summary))-Number(Boolean(a.summary)) || (Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)); const lead = sorted[0];
    const flags = [...new Set(sorted.flatMap(p=>flagsFor(p,now)))];
    if (sorted.length>1 && sorted.some((p,i)=> sorted.slice(i+1).some(q=>group.norms.get(p)===group.norms.get(q)))) flags.push('possible-syndication');
    if (privatePersonRisk(lead)) flags.push('private-person');
    const age = lead.publishedAt ? (Date.parse(now)-Date.parse(lead.publishedAt))/DAY : Infinity;
    const stale = age > 7 && Boolean(lead.publishedAt) || flags.includes('recycled-material');
    const platforms = new Set(sorted.map(p=>p.platform));
    const reaction = sorted.some(p=>Number(p.metrics?.comments)>0 || Number(p.metrics?.views)>0 || Number(p.reactionCount)>0);
    const growthOf = new Map(sorted.map(p=>[p.url, reactionGrowth(p, prevByUrl.get(p.url))]));
    const growth = sorted.map(p=>growthOf.get(p.url)).find(Boolean) || null;
    const positiveGrowth = Boolean(growth && Object.entries(growth).some(([key,g])=>g.change >= ({views:100,likes:5,comments:10}[key]||Infinity)));
    /*
     * 채널 두 곳 이상이 같은 소재를 다뤘으면 추천이다(2026-09-30 사장님 선택). 벤치마크 23곳 중 15곳이
     * 네이버 블로그인데 블로그 RSS 엔 반응 수치가 없어, '플랫폼 2곳 + 반응' 만으로는 블로그 소재가 영원히 추천이 안 됐다.
     * 제목이 똑같이 퍼 나른 것(possible-syndication)은 여전히 독립 근거가 아니라 막힌다.
     */
    const channels = new Set(sorted.map(p=>p.sourceId)).size;
    const histTops = [...new Map(sorted.map(p=>[blogIdOf(p.url), topsOf(p)])).values()].reduce((s,n)=>s+n,0);
    const maxLikes = Math.max(0, ...sorted.map(p=>Number(p.metrics?.likes)).filter(Number.isFinite));
    const proven = !measured || histTops >= 1 || maxLikes >= 10;
    const recommended = age <= 2 && !flags.some(f=>['sponsored','sensitive-claim','recycled-material','possible-syndication','private-person'].includes(f)) && Boolean(lead.summary) && (channels>=2 || (platforms.size>=2 && reaction) || positiveGrowth) && proven;
    const keyword = tokens(lead.title).slice(0,5).join(' ').slice(0,55) || lead.title.slice(0,55);
    const why = [lead.publishedAt ? `벤치마크 발행 ${lead.publishedAt.slice(0,10)} · 사건 발생일은 별도 확인` : '발행일을 확인하지 못해 최신 사건으로 판단하지 않았습니다.'];
    if (sorted.length>1) why.push(`${new Set(sorted.map(p=>p.sourceId)).size}개 채널에서 관련 제목 발견 · 독립 사실 확인과는 다릅니다.`);
    if (reaction) why.push('공개 반응이 있는 소재 · 플랫폼별 지표는 원문별로 표시합니다.');
    if (positiveGrowth) why.push('같은 게시물의 공개 반응이 이전 수집보다 늘었습니다. 채널 평소 대비 성과는 미확인입니다.');
    if (histTops > 0) why.push(`출처 블로그가 최근 홈판 상위 ${histTops}회(어드바이저 실측) — 홈판에 자주 뜨는 블로그의 소재입니다.`);
    if (flags.includes('sponsored')) why.push('제품 제공·협찬 고지 감지: 자연 유행 근거에서 제외');
    if (flags.includes('private-person')) why.push('일반인 출연자 논란 · 일반인 사건 소재라 추천하지 않습니다 — 실존 일반인을 단정하는 글은 허위조작정보 위험이 큽니다.');
    if (stale) why.push('과거 자료 또는 발행 7일 경과: 새 사실 확보 전 작성 우선순위를 낮춥니다.');
    const summary = lead.summary ? plainText(lead.summary,140) : '제목과 공개 목록만 확인했습니다. 사건 내용은 원문 확인 후 작성하세요.';
    return {
      id: crypto.createHash('sha256').update(lead.url).digest('hex').slice(0,16), keyword, title: lead.title, category: category(lead.title, sorted.map(p=>p.topic), lead.summary),
      status: stale?'stale':recommended?'review-now':'verify', recommended,
      priority: Math.max(0, (age<=1?30:age<=2?24:age<=7?12:0) + (lead.summary?10:0) + Math.min(24,(channels-1)*8) + (platforms.size>=2?15:0) + (reaction?10:0) + (positiveGrowth?10:0) - (flags.includes('sponsored')?25:0) - (stale?30:0) - (flags.includes('sensitive-claim')?20:0) + (measured ? Math.min(30, histTops*10) + (maxLikes>=10?10:0) : 0)),
      publishedAt: lead.publishedAt, eventAt: null, capturedAt: lead.capturedAt,
      freshnessLabel: stale?'시점 재검토':recommended?'원문 재확인 후 우선 검토':'원출처 확인 필요', why, summary,
      summaryAttribution: lead.summary?`${lead.name} 공개 요약 발췌 · 사실 확인 전`:'공개 제목에서 발견 · 본문 미확인',
      // 제목은 템플릿으로 채우지 않는다 — enrich-benchmark-titles 가 카드마다 homeTitles(20개)를 얹는다.
      homeTitles: [],
      // 작성 안내는 찍지 않는다(2026-10-10 사장님 "하드코딩 — 뻔한 소리") — enrich-benchmark-titles 가 카드 재료로 짓는다(없으면 빈칸)
      writingDirection: '',
      searchTargets: [],
      mustInclude: [],
      mustAvoid: [],
      relatedKeywords: tokens(lead.title).slice(0,6),
      // 작성 전 확인은 그 카드에 해당하는 경고만(어느 카드에나 붙던 '사건 날짜 · 사진 원작자'는 뺐다)
      verificationNeeded: [...(flags.includes('sensitive-claim')?['당사자·공식 자료 확인 전 인물 관련 의혹 제외']:[]), ...(flags.includes('private-person')?['일반인 실명 · 신상 · 단정 표현 제외']:[]), ...(flags.includes('sponsored')?['상업적 관계와 홍보성 주장 확인']:[])],
      imageGuide: { url: lead.url, instruction: `${lead.name} 원문에서 이미지의 원출처를 먼저 확인하세요. 원본 게시물의 제목·게시일·관련 장면을 확인한 뒤 사용 조건에 맞게 캡처하고 출처를 남기세요. 벤치마크 사진 자체의 재사용 허용 여부는 미확인입니다.` },
      metrics: { searchVolume: null, documentCount: null, rankingPossibility:'unmeasured', reactionGrowth: growth }, homefeedExposure:'unverified',
      sources: sorted.slice(0,5).map(p=>({ id:p.sourceId, platform:p.platform, name:p.name, title:p.title, url:p.url, publishedAt:p.publishedAt, summary:plainText(p.summary,140), metrics:p.metrics, ...(safeImage(p.image)?{image:p.image}:{}), ...(p.reactionCount!=null?{reactionCount:p.reactionCount,reactionLabel:p.reactionLabel}:{}), ...(p.metricNote?{metricNote:p.metricNote}:{}), ...(growthOf.get(p.url)?{growth:growthOf.get(p.url)}:{}), ...(topsOf(p)?{homefeedTops:topsOf(p)}:{}), discoveryOnly:true })), flags,
    };
  })
    // 30장 상한을 없앴다 — 최근 48시간 소재는 전부 싣는다(사장님 2026-09-30). 발행일을 모르는 것은 이번 수집에서 본 것이라 남긴다.
    .filter((c)=>!c.publishedAt || Date.parse(now)-Date.parse(c.publishedAt) <= 2*DAY)
    .sort(byBoardOrder);
  // 같은 소재 상한은 우선순위 순서로 봐야 해서 줄 세운 뒤에 건다 — 빠진 카드는 추천 뒤로 다시 줄 선다.
  return capSameStory(ordered).sort(byBoardOrder)
    // 48시간 카드는 출처 786곳이면 5천 장을 넘는다(판 17MB). 추천이 앞에 서 있으니 앞에서 MAX_CARDS 장 — 추천은 전부 들어간다.
    .slice(0, MAX_CARDS);
}
function buildPayload(results, now, previous, previousPosts=[], topBlogs=new Map()) {
  const posts = results.flatMap(r=>r.status==='ok'?r.posts:[]);
  const sources = results.map(({ posts: list, ...r })=>({ ...r, postCount:list.length }));
  const base = { schemaVersion:1, scope:'leadernam-benchmark', attemptedAt:now, sourceCount:sources.length, sources };
  if (!posts.length && previous?.schemaVersion===1 && Array.isArray(previous.candidates)) return { ...previous, ...base, status:'stale', reason:'이번 수집에서 유효한 게시물을 확보하지 못해 마지막 성공 결과를 유지합니다.' };
  const candidates = buildCandidates(posts,now,previousPosts,topBlogs);
  // 홈판 흐름 요약(2026-10-06) — 오늘 자주 뜨는 분야 · 여러 채널이 다룬 소재 · 고수 제목 모양. 사이트 · 앱이 그대로 그린다.
  const { buildTrends } = require('./homefeed-benchmarks-trends.cjs');
  return { ...base, generatedAt:posts.length?now:null, status:posts.length?(sources.every(s=>s.status==='ok')?'fresh':'partial'):'stale', collectedPostCount:posts.length, candidates, trends:buildTrends(posts,candidates,now,category), ...(topBlogs instanceof Map && topBlogs.size ? { homefeedTopBlogs:Object.fromEntries(topBlogs) } : {}) };
}
module.exports = { category, assertFetchUrl, safeLink, fetchText, plainText, serialize, validDate, parseRss, parseYoutube, parseCommunity, parseNate, parseInstagram, reactionGrowth, likeContentsId, parseLikes, buildCandidates, buildPayload };
