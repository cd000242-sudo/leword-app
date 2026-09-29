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
const LINK_HOSTS = new Set(['blog.naver.com', 'm.blog.naver.com', 'www.youtube.com', 'www.issuelink.co.kr', 'news.nate.com']);
function assertFetchUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !FETCH_PATHS[url.hostname]?.test(url.pathname)) throw new Error('Blocked source URL');
  return url;
}
function safeLink(value, base) {
  try {
    const u = new URL(value, base);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !LINK_HOSTS.has(u.hostname)) return null;
    const postPaths = { 'blog.naver.com': /^\/[a-zA-Z0-9_-]+\/\d+$/, 'm.blog.naver.com': /^\/[a-zA-Z0-9_-]+\/\d+$/, 'www.youtube.com': /^\/watch$/, 'www.issuelink.co.kr': /^\/community\/go\/[a-zA-Z0-9_-]+\/\d+$/, 'news.nate.com': /^\/view\/\d{8}n\d+$/ };
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
function reactionGrowth(current, previous) {
  if (!previous || previous.url !== current.url || previous.platform !== current.platform || Date.parse(current.capturedAt) - Date.parse(previous.capturedAt) < 60000) return null;
  const result = {};
  for (const key of ['views', 'likes', 'comments']) { const a = previous.metrics?.[key], b = current.metrics?.[key]; if (Number.isFinite(a) && Number.isFinite(b) && b >= a) result[key] = { change: b-a, elapsedMinutes: Math.round((Date.parse(current.capturedAt)-Date.parse(previous.capturedAt))/60000) }; }
  return Object.keys(result).length ? result : null;
}
function normalized(title) { return plainText(title,160).toLowerCase().replace(/[^가-힣a-z0-9]/g,''); }
function tokens(title) { return [...new Set(plainText(title,160).replace(/["'“”‘’!?.,()[\]…]/g,' ').split(/\s+/).filter(s => s.length >= 2 && !/^(현재|지금|오늘|정리|이유|근황|화제|논란|확인|모음|후기|jpg|ㄷㄷ|ㅎㄷㄷ)/i.test(s)))]; }
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
function buildCandidates(posts, now, previousPosts = []) {
  const groups = [];
  for (const post of posts.filter(p => p.title && safeLink(p.url) && !/ㅇㅎ[)\s]|후방주의|여캠시절|노출사진/.test(p.title))) {
    const terms = tokens(post.title); let group = groups.find(g => g.posts.some(p => p.url === post.url || normalized(p.title) === normalized(post.title)));
    if (!group && terms.length >= 3) group = groups.find(g => { const shared = terms.filter(t => g.terms.includes(t)); return shared.length >= 3 && shared.length/Math.min(terms.length,g.terms.length) >= .6; });
    if (group) { if (!group.posts.some(p => p.url===post.url)) group.posts.push(post); }
    else groups.push({ posts: [post], terms });
  }
  // A community headline alone is a discovery signal, not an adequately sourced writing brief.
  return groups.filter(group=>group.posts.some(p=>p.platform!=='community-ranking' && p.summary)).map(group => {
    const sorted = [...group.posts].sort((a,b) => Number(Boolean(b.summary))-Number(Boolean(a.summary)) || (Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0)); const lead = sorted[0];
    const flags = [...new Set(sorted.flatMap(p=>flagsFor(p,now)))];
    if (sorted.length>1 && sorted.some((p,i)=> sorted.slice(i+1).some(q=>normalized(p.title)===normalized(q.title)))) flags.push('possible-syndication');
    const age = lead.publishedAt ? (Date.parse(now)-Date.parse(lead.publishedAt))/DAY : Infinity;
    const stale = age > 7 && Boolean(lead.publishedAt) || flags.includes('recycled-material');
    const platforms = new Set(sorted.map(p=>p.platform));
    const reaction = sorted.some(p=>Number(p.metrics?.comments)>0 || Number(p.metrics?.views)>0 || Number(p.reactionCount)>0);
    const growth = sorted.map(p=>reactionGrowth(p,previousPosts.find(prev=>prev.url===p.url))).find(Boolean) || null;
    const positiveGrowth = Boolean(growth && Object.entries(growth).some(([key,g])=>g.change >= ({views:100,likes:5,comments:10}[key]||Infinity)));
    const recommended = age <= 2 && !flags.some(f=>['sponsored','sensitive-claim','recycled-material','possible-syndication'].includes(f)) && Boolean(lead.summary) && ((platforms.size>=2 && reaction) || positiveGrowth);
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
      priority: Math.max(0, (age<=1?30:age<=2?24:age<=7?12:0) + (lead.summary?10:0) + (platforms.size>=2?15:0) + (reaction?10:0) + (positiveGrowth?10:0) - (flags.includes('sponsored')?25:0) - (stale?30:0) - (flags.includes('sensitive-claim')?20:0)),
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
  }).sort((a,b)=>Number(b.recommended)-Number(a.recommended) || b.priority-a.priority || a.id.localeCompare(b.id)).slice(0,30);
}
function buildPayload(results, now, previous, previousPosts=[]) {
  const posts = results.flatMap(r=>r.status==='ok'?r.posts:[]);
  const sources = results.map(({ posts: list, ...r })=>({ ...r, postCount:list.length }));
  const base = { schemaVersion:1, scope:'leadernam-benchmark', attemptedAt:now, sourceCount:sources.length, sources };
  if (!posts.length && previous?.schemaVersion===1 && Array.isArray(previous.candidates)) return { ...previous, ...base, status:'stale', reason:'이번 수집에서 유효한 게시물을 확보하지 못해 마지막 성공 결과를 유지합니다.' };
  return { ...base, generatedAt:posts.length?now:null, status:posts.length?(sources.every(s=>s.status==='ok')?'fresh':'partial'):'stale', collectedPostCount:posts.length, candidates:buildCandidates(posts,now,previousPosts) };
}
module.exports = { assertFetchUrl, safeLink, fetchText, plainText, serialize, validDate, parseRss, parseYoutube, parseCommunity, parseNate, reactionGrowth, buildCandidates, buildPayload };
