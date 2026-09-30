'use strict';
const cheerio = require('cheerio');
const crypto = require('node:crypto');

const DAY = 86400000;
const FETCH_PATHS = {
  'rss.blog.naver.com': /^\/[a-zA-Z0-9_-]+\.xml$/,
  'www.youtube.com': /^\/(?:@[a-zA-Z0-9_-]+|feeds\/videos\.xml)$/,
  'www.issuelink.co.kr': /^\/community\/listview\/all\/24\/comment\/_blank\/?$/,
  'news.nate.com': /^\/rank\/emoticon$/,
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
    const response = await fetchImpl(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'LEWORD-PublicBenchmark/1.0', Accept: 'text/html,application/rss+xml,application/atom+xml;q=0.9' } });
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
function basePost(source, capturedAt, data) { return { sourceId: source.id, platform: source.platform, name: plainText(source.name || source.id, 70), eventAt: null, capturedAt, metrics: { views: null, likes: null, comments: null }, ...data }; }
function parseRss(xml, source, capturedAt) {
  const $ = cheerio.load(xml, { xmlMode: true }); const name = plainText($('channel > title').first().text(), 70) || source.id;
  const posts = $('item').toArray().slice(0, 20).map(el => { const e = $(el); const url = safeLink(e.find('link').first().text()); if (!url || !['blog.naver.com', 'm.blog.naver.com'].includes(new URL(url).hostname)) return null;
    return basePost({ ...source, name }, capturedAt, { title: plainText(e.find('title').first().text(), 160), url, publishedAt: validDate(e.find('pubDate').text(), capturedAt), summary: plainText(e.find('description').text(), 300) });
  }).filter(p => p?.title);
  return { name, posts };
}
function parseYoutube(xml, source, capturedAt) {
  const $ = cheerio.load(xml, { xmlMode: true }); const name = plainText($('feed > title').first().text(), 70) || source.id;
  const posts = $('entry').toArray().slice(0, 15).map(el => { const e = $(el); const url = safeLink(e.find('link').attr('href')); if (!url) return null;
    return basePost({ ...source, name }, capturedAt, { title: plainText(e.find('title').first().text(),160), url, publishedAt: validDate(e.find('published').text(), capturedAt), summary: plainText(e.find('media\\:description').text(),300), metrics: { views: count(e.find('media\\:statistics').attr('views')), likes: null, comments: null } });
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
function sharedTokens(a, b) {
  // 포함 관계('디올원영' ⊃ '원영')는 숫자 없는 말끼리만 — '2년' 이 '12년' 에 들어간다고 같은 소재가 아니다.
  const contains = (t, u) => !/\d/.test(t) && !/\d/.test(u) && t.length >= 2 && u.length >= 2 && (t.includes(u) || u.includes(t));
  return a.filter((t) => b.some((u) => t === u || contains(t, u))).length;
}
function sameStory(a, b) {
  // 양쪽에서 센다 — '디올원영' 한 낱말이 '디올'·'원영' 둘을 덮으므로 한쪽에서만 세면 1이 된다.
  const shared = Math.max(sharedTokens(a, b), sharedTokens(b, a));
  return shared >= 2 && shared / Math.min(a.length, b.length) >= 0.5;
}
function category(title) {
  for (const [name, pattern] of [['생활경제·주거', /전세|주택|아파트|대출|지원금|연금|세금|청약|금리|부동산|소상공인|보조금|저축/],['패션·뷰티', /패션|코디|착장|가방|샤넬|데님|세럼|화장품|여행룩/],['여행·생활', /여행|숙소|호텔|런던|공항|맛집|날씨|교통/],['스포츠·게임', /야구|축구|선수|아시안게임|올림픽|게임|메달|홈런/],['문화·연예', /배우|가수|아이돌|방송|드라마|영화|콘서트|아이브|카즈하|고윤정|카리나|트로트/]]) if (pattern.test(title)) return name;
  return '사회·이슈';
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
const MAX_CARDS = 300;
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
function buildCandidates(posts, now, previousPosts = []) {
  const groups = groupPosts(posts);
  // A community headline alone is a discovery signal, not an adequately sourced writing brief.
  return groups.filter(group=>group.posts.some(p=>p.platform!=='community-ranking' && p.summary)).map(group => {
    const sorted = [...group.posts].sort((a,b) => Number(Boolean(b.summary))-Number(Boolean(a.summary)) || (Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)); const lead = sorted[0];
    const flags = [...new Set(sorted.flatMap(p=>flagsFor(p,now)))];
    if (sorted.length>1 && sorted.some((p,i)=> sorted.slice(i+1).some(q=>group.norms.get(p)===group.norms.get(q)))) flags.push('possible-syndication');
    const age = lead.publishedAt ? (Date.parse(now)-Date.parse(lead.publishedAt))/DAY : Infinity;
    const stale = age > 7 && Boolean(lead.publishedAt) || flags.includes('recycled-material');
    const platforms = new Set(sorted.map(p=>p.platform));
    const reaction = sorted.some(p=>Number(p.metrics?.comments)>0 || Number(p.metrics?.views)>0 || Number(p.reactionCount)>0);
    const growth = sorted.map(p=>reactionGrowth(p,previousPosts.find(prev=>prev.url===p.url))).find(Boolean) || null;
    const positiveGrowth = Boolean(growth && Object.entries(growth).some(([key,g])=>g.change >= ({views:100,likes:5,comments:10}[key]||Infinity)));
    /*
     * 채널 두 곳 이상이 같은 소재를 다뤘으면 추천이다(2026-09-30 사장님 선택). 벤치마크 23곳 중 15곳이
     * 네이버 블로그인데 블로그 RSS 엔 반응 수치가 없어, '플랫폼 2곳 + 반응' 만으로는 블로그 소재가 영원히 추천이 안 됐다.
     * 제목이 똑같이 퍼 나른 것(possible-syndication)은 여전히 독립 근거가 아니라 막힌다.
     */
    const channels = new Set(sorted.map(p=>p.sourceId)).size;
    const recommended = age <= 2 && !flags.some(f=>['sponsored','sensitive-claim','recycled-material','possible-syndication'].includes(f)) && Boolean(lead.summary) && (channels>=2 || (platforms.size>=2 && reaction) || positiveGrowth);
    const keyword = tokens(lead.title).slice(0,5).join(' ').slice(0,55) || lead.title.slice(0,55);
    const why = [lead.publishedAt ? `벤치마크 발행 ${lead.publishedAt.slice(0,10)} · 사건 발생일은 별도 확인` : '발행일을 확인하지 못해 최신 사건으로 판단하지 않았습니다.'];
    if (sorted.length>1) why.push(`${new Set(sorted.map(p=>p.sourceId)).size}개 채널에서 관련 제목 발견 · 독립 사실 확인과는 다릅니다.`);
    if (reaction) why.push('공개 반응이 있는 소재 · 플랫폼별 지표는 원문별로 표시합니다.');
    if (positiveGrowth) why.push('같은 게시물의 공개 반응이 이전 수집보다 늘었습니다. 채널 평소 대비 성과는 미확인입니다.');
    if (flags.includes('sponsored')) why.push('제품 제공·협찬 고지 감지: 자연 유행 근거에서 제외');
    if (stale) why.push('과거 자료 또는 발행 7일 경과: 새 사실 확보 전 작성 우선순위를 낮춥니다.');
    const summary = lead.summary ? plainText(lead.summary,140) : '제목과 공개 목록만 확인했습니다. 사건 내용은 원문 확인 후 작성하세요.';
    return {
      id: crypto.createHash('sha256').update(lead.url).digest('hex').slice(0,16), keyword, title: lead.title, category: category(lead.title),
      status: stale?'stale':recommended?'review-now':'verify', recommended,
      priority: Math.max(0, (age<=1?30:age<=2?24:age<=7?12:0) + (lead.summary?10:0) + Math.min(24,(channels-1)*8) + (platforms.size>=2?15:0) + (reaction?10:0) + (positiveGrowth?10:0) - (flags.includes('sponsored')?25:0) - (stale?30:0) - (flags.includes('sensitive-claim')?20:0)),
      publishedAt: lead.publishedAt, eventAt: null, capturedAt: lead.capturedAt,
      freshnessLabel: stale?'시점 재검토':recommended?'원문 재확인 후 우선 검토':'원출처 확인 필요', why, summary,
      summaryAttribution: lead.summary?`${lead.name} 공개 요약 발췌 · 사실 확인 전`:'공개 제목에서 발견 · 본문 미확인',
      // 제목은 템플릿으로 채우지 않는다 — enrich-benchmark-titles 가 카드마다 homeTitles(20개)를 얹는다.
      homeTitles: [],
      writingDirection: `${keyword}를 검색하는 독자의 질문에 답하는 해설을 작성하세요. 위 벤치마크의 주장과 원출처에서 확인한 사실을 구분하고, 새로 확인한 날짜·조건·변경점부터 제시하세요.`,
      mustInclude: [`${keyword}의 원문 링크와 발행일`, '사건 발생일과 지금 다시 다룰 이유', '독자가 직접 확인할 절차 또는 비교 기준'],
      mustAvoid: ['벤치마크의 경험을 직접 경험한 것처럼 쓰기', '확인하지 않은 가격·정책·인물 주장을 사실로 단정', '실측하지 않은 홈판 노출 확률·수익 보장'],
      relatedKeywords: tokens(lead.title).slice(0,6),
      verificationNeeded: ['원출처의 실제 사건 날짜와 최신 변경 사항', '사진 원작자와 재사용 조건', ...(flags.includes('sensitive-claim')?['당사자·공식 자료 확인 전 인물 관련 의혹 제외']:[]), ...(flags.includes('sponsored')?['상업적 관계와 홍보성 주장 확인']:[])],
      imageGuide: { url: lead.url, instruction: `${lead.name} 원문에서 이미지의 원출처를 먼저 확인하세요. 원본 게시물의 제목·게시일·관련 장면을 확인한 뒤 사용 조건에 맞게 캡처하고 출처를 남기세요. 벤치마크 사진 자체의 재사용 허용 여부는 미확인입니다.` },
      metrics: { searchVolume: null, documentCount: null, rankingPossibility:'unmeasured', reactionGrowth: growth }, homefeedExposure:'unverified',
      sources: sorted.slice(0,5).map(p=>({ id:p.sourceId, platform:p.platform, name:p.name, title:p.title, url:p.url, publishedAt:p.publishedAt, summary:plainText(p.summary,140), metrics:p.metrics, ...(p.reactionCount!=null?{reactionCount:p.reactionCount,reactionLabel:p.reactionLabel}:{}), ...(p.metricNote?{metricNote:p.metricNote}:{}), discoveryOnly:true })), flags,
    };
  })
    // 30장 상한을 없앴다 — 최근 48시간 소재는 전부 싣는다(사장님 2026-09-30). 발행일을 모르는 것은 이번 수집에서 본 것이라 남긴다.
    .filter((c)=>!c.publishedAt || Date.parse(now)-Date.parse(c.publishedAt) <= 2*DAY)
    .sort((a,b)=>Number(b.recommended)-Number(a.recommended) || b.priority-a.priority || (Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0) || a.sources[0].url.localeCompare(b.sources[0].url))
    // 출처 188곳이면 48시간 카드가 1,600장을 넘는다(판 6MB). 추천이 앞에 서 있으니 앞에서 300장 — 추천은 전부 들어간다.
    .slice(0, MAX_CARDS);
}
function buildPayload(results, now, previous, previousPosts=[]) {
  const posts = results.flatMap(r=>r.status==='ok'?r.posts:[]);
  const sources = results.map(({ posts: list, ...r })=>({ ...r, postCount:list.length }));
  const base = { schemaVersion:1, scope:'leadernam-benchmark', attemptedAt:now, sourceCount:sources.length, sources };
  if (!posts.length && previous?.schemaVersion===1 && Array.isArray(previous.candidates)) return { ...previous, ...base, status:'stale', reason:'이번 수집에서 유효한 게시물을 확보하지 못해 마지막 성공 결과를 유지합니다.' };
  return { ...base, generatedAt:posts.length?now:null, status:posts.length?(sources.every(s=>s.status==='ok')?'fresh':'partial'):'stale', collectedPostCount:posts.length, candidates:buildCandidates(posts,now,previousPosts) };
}
module.exports = { assertFetchUrl, safeLink, fetchText, plainText, serialize, validDate, parseRss, parseYoutube, parseCommunity, parseNate, parseInstagram, reactionGrowth, buildCandidates, buildPayload };
