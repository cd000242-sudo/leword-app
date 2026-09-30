#!/usr/bin/env node
'use strict';
// Public, deterministic collection: no AI account or browser session. The only secret is the
// Bright Data token for Instagram (--instagram cache; hourly runs reuse the daily pool).
const fs = require('node:fs');
const path = require('node:path');
const core = require('./homefeed-benchmarks-core.cjs');
const registry = require('./homefeed-benchmarks-sources.json');

async function collect(source, now, fetcher = core.fetchText, instagram = null) {
  const base = { id:source.id, platform:source.platform, name:source.name || source.id, url:source.url, capturedAt:now };
  if (source.platform==='instagram') {
    const entry = instagram?.get(source.id);
    if (!entry) return { ...base, status:'unavailable', reason:'인스타 읽기(Bright Data)가 이 실행에 연결되지 않아 이번 추천에서 제외했습니다.', posts:[] };
    return { ...base, status:entry.status, ...(entry.reason?{reason:entry.reason}:{}), ...(entry.fetchedAt?{fetchedAt:entry.fetchedAt}:{}), posts:entry.posts };
  }
  try {
    let result;
    if (source.platform==='naver-blog') result=core.parseRss(await fetcher(source.feedUrl),source,now);
    else if (source.platform==='youtube') {
      const html=await fetcher(source.url);
      const channelId=html.match(/"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/)?.[1];
      if (!channelId) throw new Error('Public channel ID unavailable');
      result=core.parseYoutube(await fetcher(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`),source,now);
    } else if (source.platform==='community-ranking') result=core.parseCommunity(await fetcher(source.url),source,now);
    else if (source.platform==='news-ranking') result=core.parseNate(await fetcher(source.url),source,now);
    else throw new Error('Unsupported platform');
    if (!result.posts.length) return { ...base, status:'failed', reason:'응답을 받았지만 유효한 공개 게시물이 없습니다. 페이지 구조 또는 접근 상태를 확인해야 합니다.', posts:[] };
    return { ...base, name:result.name, status:'ok', posts:result.posts };
  } catch(error) {
    // Keep public error output free of response bodies, credentials, local paths and implementation stacks.
    const reason=/^HTTP \d+$/.test(error.message)?error.message:'공개 출처 수집 실패 또는 응답 형식 변경';
    return { ...base, status:'failed', reason, posts:[] };
  }
}
/*
 * 블로그 글 공감 수(2026-10-01 사장님 "1번 2번 3번 전부"). RSS 엔 반응 수치가 없어 증가를 못 쟀다.
 * 공감 창구(blog.like.naver.com)는 한 번에 글 하나만 답한다(여러 개를 물어도 첫 글만 — 실험 확인).
 * 홈판 노출로 반응이 붙는 건 올린 직후라, 24시간 안의 최신 글부터 한 회차 600개까지만 잰다(4개씩 동시).
 * 실패해도 수집은 계속 — 공감은 빈 칸으로 남는다. 받은 결과는 새 배열로 돌려준다(원본은 안 바꾼다).
 */
const LIKE_WINDOW_MS = 24 * 3600 * 1000;
const LIKE_MAX = 600;
async function withBlogLikes(results, now, fetcher = core.fetchText) {
  const recent = results.flatMap(r => r.status==='ok' ? r.posts : [])
    .filter(p => p.platform==='naver-blog' && p.publishedAt && Date.parse(now)-Date.parse(p.publishedAt) <= LIKE_WINDOW_MS)
    .sort((a,b) => Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  const ids = [...new Set(recent.map(p=>core.likeContentsId(p.url)).filter(Boolean))].slice(0, LIKE_MAX);
  const likes = new Map(); let failed = 0;
  for (let i=0;i<ids.length;i+=4) {
    await Promise.all(ids.slice(i,i+4).map(async (id) => {
      try {
        const text = await fetcher(`https://blog.like.naver.com/v1/search/contents?suppress_response_codes=true&pool=blogid&isDuplication=false&q=${encodeURIComponent(`BLOG[${id}]`)}`);
        for (const [key, value] of core.parseLikes(JSON.parse(text))) likes.set(key, value);
      } catch { failed += 1; }
    }));
  }
  console.log(`공감 실측: 24시간 안 블로그 글 ${recent.length}개 중 ${ids.length}개 조회 · 받은 ${likes.size}${failed?` · 실패 ${failed}`:''}`);
  return results.map(r => ({ ...r, posts: r.posts.map(p => {
    const value = likes.get(core.likeContentsId(p.url));
    return Number.isFinite(value) ? { ...p, metrics: { ...p.metrics, likes: value } } : p;
  }) }));
}
function readJson(filename) { try { return JSON.parse(fs.readFileSync(filename,'utf8')); } catch { return null; } }
/** 인스타 출처 전부를 Bright Data 로 한 번에 읽고(하루 1회), 출처별 기준 게시물 묶음과 새 캐시를 돌려준다. */
async function loadInstagram(sources, now, cacheFile) {
  const { collectInstagram } = require('./homefeed-instagram.cjs');
  const { cache, results } = await collectInstagram({ sources, now, cache: readJson(cacheFile), token: process.env.BRIGHTDATA_TOKEN || '', log: (line) => console.log(line) });
  const bundle = new Map();
  for (const source of sources) {
    const entry = results.get(source.id); const { posts } = core.parseInstagram(entry.posts, source, now);
    if (entry.status==='ok' && !posts.length) bundle.set(source.id, { status:'failed', reason:'응답을 받았지만 유효한 공개 게시물이 없습니다. 페이지 구조 또는 접근 상태를 확인해야 합니다.', posts:[] });
    else bundle.set(source.id, { ...entry, posts });
  }
  return { cache, bundle };
}
function atomicWrite(filename, value) {
  const resolved=path.resolve(filename); fs.mkdirSync(path.dirname(resolved),{recursive:true});
  const temp=`${resolved}.${process.pid}.tmp`;
  try { fs.writeFileSync(temp,core.serialize(value)+'\n','utf8'); fs.renameSync(temp,resolved); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
async function main(argv=process.argv.slice(2)) {
  const args={}; for(let i=0;i<argv.length;i++) { if(!['--output','--state','--instagram'].includes(argv[i]) || !argv[i+1]) throw new Error('Usage: node scripts/homefeed-benchmarks.cjs --output <public.json> --state <history.json> [--instagram <cache.json>]'); args[argv[i].slice(2)]=argv[++i]; }
  if(!args.output || !args.state) throw new Error('--output and --state are required');
  if(new Set([args.output,args.state,args.instagram].filter(Boolean).map(f=>path.resolve(f))).size!==[args.output,args.state,args.instagram].filter(Boolean).length) throw new Error('Output, state and instagram cache must differ');
  const now=new Date().toISOString(); const previous=readJson(args.output); const previousState=readJson(args.state); let results=[];
  // 인스타는 출처별이 아니라 묶음으로 한 번만 Bright Data 에 청한다(계정 5개를 따로 부르면 5번 과금 창구가 열린다).
  const instagram=args.instagram?await loadInstagram(registry.sources.filter(s=>s.platform==='instagram'),now,args.instagram):null;
  if(instagram) atomicWrite(args.instagram,instagram.cache);
  for(let i=0;i<registry.sources.length;i+=3) {
    const batch=await Promise.all(registry.sources.slice(i,i+3).map(s=>collect(s,now,undefined,instagram?.bundle))); results.push(...batch);
    for(const result of batch) console.log(`${result.id}: ${result.status} (${result.posts.length})`);
  }
  results=await withBlogLikes(results,now);
  let payload=core.buildPayload(results,now,previous,previousState?.observations||[]);
  const {applyReviewedEditorial}=require('./homefeed-benchmarks-editorial.cjs');
  payload=applyReviewedEditorial(payload,results.flatMap(r=>r.posts),require('./homefeed-benchmarks-editorial.json'),now);
  atomicWrite(args.output,payload);
  const posts=results.flatMap(r=>r.posts);
  if(posts.length) {
    // Public counters and timestamps only: do not publish RSS bodies or private session data.
    const observations=posts.map(p=>({url:p.url,platform:p.platform,capturedAt:p.capturedAt,metrics:p.metrics}));
    atomicWrite(args.state,{schemaVersion:1,observedAt:now,observations});
  }
  console.log(JSON.stringify({status:payload.status,posts:payload.collectedPostCount,candidates:payload.candidates.length,recommended:payload.candidates.filter(c=>c.recommended).length}));
  if(!posts.length) process.exitCode=2;
  return payload;
}
if(require.main===module) main().catch(error=>{ console.error(error.message); process.exitCode=1; });
module.exports={collect,atomicWrite,main,withBlogLikes};
