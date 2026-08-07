#!/usr/bin/env node
/**
 * SERP 공백 감사 — "문서수로 버린 후보 중 실제로는 먹을 수 있었던 게 몇 %인가"
 *
 * 지금 판정은 문서수 숫자 하나로 끝난다. 그런데 문서수 3,000개가 전부
 * 나무위키·언론사면 못 먹고, 8,000개라도 개인 블로그가 섞여 있으면 먹는다.
 * 이 스크립트는 브라이트데이터 SERP API 로 **네이버 1페이지 실물**을 받아
 * 그 구성으로 재판정한다.
 *
 * 사용법:
 *   BRIGHTDATA_TOKEN=xxx node scripts/serp-gap-audit.js --in=keywords.json [--limit=100] [--out=report.json]
 *   BRIGHTDATA_TOKEN=xxx node scripts/serp-gap-audit.js --keywords="키워드1,키워드2"
 *
 * 브라이트데이터 주의: data_format=html 을 반드시 넣어야 한다.
 * 없으면 네이버는 파서가 없어 x-brd-error(502) 로 빈 본문이 온다(HTTP 는 200).
 */

const https = require('https');
const fs = require('fs');

const TOKEN = (process.env.BRIGHTDATA_TOKEN || '').trim();
const ZONE = process.env.BRIGHTDATA_ZONE || '77';
const DELAY_MS = 400;

/** 개인이 진입 가능한 자리 = 블로그/카페. 나머지는 사실상 고정석이다. */
const WINNABLE_HOSTS = [/blog\.naver\.com/i, /cafe\.naver\.com/i, /tistory\.com/i, /blog\.me/i, /brunch\.co\.kr/i, /post\.naver\.com/i];
/** 개인이 못 밀어내는 자리 */
const LOCKED_HOSTS = [/namu\.wiki/i, /terms\.naver\.com/i, /news\.naver\.com/i, /n\.news\.naver\.com/i, /kin\.naver\.com/i, /namu\.news/i, /\.go\.kr/i, /wikipedia\.org/i, /youtube\.com/i, /shopping\.naver\.com/i];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function brightDataFetch(url) {
  const payload = JSON.stringify({ zone: ZONE, url, format: 'raw', data_format: 'html' });
  return new Promise((resolve) => {
    const req = https.request('https://api.brightdata.com/request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 90_000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const brdStatus = res.headers['x-brd-status-code'];
        const brdError = res.headers['x-brd-error'];
        resolve({ ok: !brdError && body.length > 1000, body, brdStatus, brdError });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, body: '', brdError: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, body: '', brdError: e.message }));
    req.write(payload);
    req.end();
  });
}

/** "2주 전" / "2026.08.07" 를 경과 일수로. 못 읽으면 null. */
function toDaysAgo(token, now) {
  const rel = token.match(/^(\d+)\s*(시간|일|주|개월)\s*전$/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = { 시간: 1 / 24, 일: 1, 주: 7, 개월: 30 }[rel[2]];
    return Math.round(n * unit);
  }
  const abs = token.match(/^(20\d\d)\.(\d\d)\.(\d\d)$/);
  if (abs) {
    const t = Date.UTC(Number(abs[1]), Number(abs[2]) - 1, Number(abs[3]));
    return Math.round((now - t) / 86_400_000);
  }
  return null;
}

/**
 * 블로그 탭 상위 글의 **발행일 분포**로 공백을 판정한다.
 *
 * 문서수를 세지 않는 것이 핵심이다. 문서가 3,000개여도 전부 작년 기준을 설명하고
 * 있으면 그건 공백이고, 300개여도 이번 주에 최신 정보로 다 다뤄졌으면 공백이 아니다.
 * 통합검색 전체에서 blog.naver.com 링크를 세는 방식은 미리보기·연관블로그까지
 * 잡혀서 전 키워드가 100% 통과했다(변별력 0) — 그래서 블로그 탭 + 날짜로 바꿨다.
 */
/** 검색어 어절이 제목에 몇 개나 들어있는지(0~1). 조사·공백 차이는 무시. */
function titleCoverage(title, keyword) {
  const norm = (s) => String(s).replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase();
  const t = norm(title);
  const tokens = String(keyword).split(/\s+/).map(norm).filter((x) => x.length >= 2);
  if (tokens.length === 0) return 0;
  return tokens.filter((tok) => t.includes(tok)).length / tokens.length;
}

/**
 * 블로그 탭 상위 글이 **그 질문에 정면으로 답하고 있는지** 를 본다.
 *
 * 여기까지 두 번 틀렸다(기록으로 남긴다):
 *  1) 통합검색에서 blog.naver.com 링크 수 세기 → 미리보기·연관블로그까지 잡혀
 *     전 키워드 100% 통과. 변별력 0.
 *  2) 상위 글 발행일로 신선도 판정 → 네이버 블로그 탭이 최신 글을 우대해서
 *     거의 모든 키워드가 "최근 30일 내 10건". 역시 변별력 0.
 * 그래서 셋째 신호 = 제목 커버리지. 명령서 §8.2 의 "이 키워드의 intent 에
 * 실제로 답하고 있는가" 에 가장 가깝다.
 */
function analyzeSerp(html, keyword, now = Date.now()) {
  // 네이버 신 마크업(sds-comps-*): 제목은 headline 계열 클래스 span 안에 있고
  // 검색어 일치 부분이 <mark> 로 감싸져 들어온다. 태그를 걷어내고 텍스트만 합친다.
  const titles = [...html.matchAll(/sds-comps-text-type-headline[^"]*"[^>]*>([\s\S]{2,200}?)<\/span>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 4)
    .slice(0, 10);
  const coverages = titles.map((t) => titleCoverage(t, keyword));
  const exact = coverages.filter((c) => c >= 0.999).length;
  const partial = coverages.filter((c) => c >= 0.6 && c < 0.999).length;

  const dateTokens = [...html.matchAll(/>(\d+\s*(?:시간|일|주|개월)\s*전|20\d\d\.\d\d\.\d\d)</g)].map((m) => m[1].trim());
  const daysAgo = dateTokens.map((t) => toDaysAgo(t, now)).filter((d) => d !== null).slice(0, 10);
  const medianDaysAgo = daysAgo.length > 0 ? [...daysAgo].sort((a, b) => a - b)[Math.floor(daysAgo.length / 2)] : null;

  return {
    sampledTitles: titles.length,
    exactTitleHits: exact,
    partialTitleHits: partial,
    medianDaysAgo,
    influencer: (html.match(/인플루언서/g) || []).length,
    topTitles: titles.slice(0, 3),
  };
}

/**
 * 판정 — 상위에 그 질문을 제목으로 정면으로 다룬 글이 적을수록 선점 여지가 크다.
 * 임계값은 아직 실증되지 않았다(현장 채택 데이터로 보정해야 함).
 */
function verdictFor(serp) {
  if (serp.sampledTitles < 3) return { verdict: 'NO_DATA', reason: '상위 글 제목을 읽지 못함 — 판정 보류' };
  const { exactTitleHits: exact, partialTitleHits: partial, sampledTitles: n } = serp;
  if (exact === 0 && partial <= 2) {
    return { verdict: 'WINNABLE', reason: `상위 ${n}개 중 제목 정면 대응 0건(부분 ${partial}건) — 정면으로 답한 글 없음` };
  }
  if (exact <= 2) {
    return { verdict: 'CONTESTED', reason: `제목 정확 일치 ${exact}건 / 부분 ${partial}건 — 경쟁 있으나 여지 있음` };
  }
  return { verdict: 'LOCKED', reason: `제목 정확 일치 ${exact}건 — 이미 정면으로 다뤄짐` };
}

async function main() {
  if (!TOKEN) {
    console.error('BRIGHTDATA_TOKEN 환경변수가 필요합니다.');
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const arg = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');
  const limit = Number(arg('limit')) || 30;
  const outPath = arg('out');

  let keywords = [];
  const inline = arg('keywords');
  const inPath = arg('in');
  if (inline) keywords = inline.split(',').map((k) => k.trim()).filter(Boolean);
  else if (inPath) {
    const parsed = JSON.parse(fs.readFileSync(inPath, 'utf8'));
    keywords = (Array.isArray(parsed) ? parsed : parsed.keywords || []).map((k) => (typeof k === 'string' ? k : k.keyword)).filter(Boolean);
  }
  keywords = [...new Set(keywords)].slice(0, limit);
  if (keywords.length === 0) {
    console.error('검사할 키워드가 없습니다. --in 또는 --keywords 를 주세요.');
    process.exit(2);
  }

  console.log('='.repeat(70));
  console.log(`SERP 공백 감사  ${keywords.length}건  (존 ${ZONE})`);
  console.log('='.repeat(70));

  const rows = [];
  for (let i = 0; i < keywords.length; i += 1) {
    const keyword = keywords[i];
    await sleep(DELAY_MS);
    // 블로그 탭 — 통합검색과 달리 순위·발행일이 정돈되어 나온다
    const url = `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(keyword)}`;
    const res = await brightDataFetch(url);
    if (!res.ok) {
      console.log(`  ?? ${keyword.padEnd(26)} 수집실패 ${res.brdError || res.brdStatus}`);
      rows.push({ keyword, error: res.brdError || String(res.brdStatus) });
      continue;
    }
    const serp = analyzeSerp(res.body, keyword);
    const { verdict, reason } = verdictFor(serp);
    const icon = verdict === 'WINNABLE' ? '🟢' : verdict === 'CONTESTED' ? '🟡' : '🔴';
    console.log(`  ${icon} ${keyword.padEnd(26)} ${verdict.padEnd(10)} ${reason}`);
    rows.push({ keyword, ...serp, verdict, reason });
  }

  const done = rows.filter((r) => r.verdict);
  const winnable = done.filter((r) => r.verdict === 'WINNABLE').length;
  const contested = done.filter((r) => r.verdict === 'CONTESTED').length;
  const locked = done.filter((r) => r.verdict === 'LOCKED').length;

  console.log('\n' + '-'.repeat(70));
  console.log(`판정 완료 ${done.length}건 / 실패 ${rows.length - done.length}건`);
  console.log(`  🟢 WINNABLE  ${winnable}`);
  console.log(`  🟡 CONTESTED ${contested}`);
  console.log(`  🔴 LOCKED    ${locked}`);
  if (done.length > 0) {
    const rate = Math.round(((winnable + contested) / done.length) * 100);
    console.log(`\n진입 가능 비율: ${rate}%  (WINNABLE+CONTESTED / 판정완료)`);
  }
  console.log('-'.repeat(70));

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2), 'utf8');
    console.log(`리포트 저장: ${outPath}`);
  }
}

main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
