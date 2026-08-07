#!/usr/bin/env node
/**
 * 의존성 헬스 하네스 — 무엇이 죽었는지 즉시 드러낸다.
 *
 * 이 프로젝트가 반복해서 물린 실패는 "완전 다운"이 아니라 **무증상 실패**였다.
 *   - 200인데 본문이 SPA 폴백 HTML (bigkinds, 11번가)
 *   - 200인데 JSON 대신 접근오류 HTML (DataLab, UA 누락 시)
 *   - 200인데 0건 (다음 실검 셀렉터 노후화)
 *   - 크기 게이트 오판으로 정상 응답을 폐기 (oliveyoung MIN_VALID_HTML_SIZE)
 *   - 파라미터 하나 빠져 원인 메시지 없는 500 (복지 API callTp)
 * 그래서 상태코드만 보지 않고 **파싱 후 건수**와 **본문 형태**까지 확인한다.
 *
 * 사용법:
 *   node scripts/harness-health.js                 전체
 *   node scripts/harness-health.js --only=server   그룹만 (server|sources|policy|site)
 *   node scripts/harness-health.js --json=out.json 리포트 저장
 *   node scripts/harness-health.js --quiet         FAIL/WARN 만 출력
 *
 * 종료코드: 0=이상없음, 1=FAIL 있음, 2=하네스 자체 오류
 */

const https = require('https');
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const { URL } = require('url');

const TIMEOUT_MS = 20_000;
const CONCURRENCY = 4;
const SERVER_BASE = process.env.LEWORD_SERVER_BASE || 'https://141.164.59.17.sslip.io';
const SITE_BASE = process.env.LEWORD_SITE_BASE || 'https://leaderspro.kr';

// ---------------------------------------------------------------- HTTP

function fetchUrl(target, options = {}, redirectsLeft = 4) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      resolve({ ok: false, status: 0, body: '', ms: 0, error: 'invalid-url' });
      return;
    }
    const client = parsed.protocol === 'http:' ? http : https;
    const started = Date.now();
    const req = client.request(parsed, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36',
        'Accept-Encoding': 'gzip, deflate',
        ...(options.headers || {}),
      },
      timeout: options.timeoutMs || TIMEOUT_MS,
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(fetchUrl(new URL(res.headers.location, parsed).toString(), options, redirectsLeft - 1));
        return;
      }
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      let stream = res;
      if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve({
        ok: status >= 200 && status < 300,
        status,
        body: Buffer.concat(chunks).toString('utf8'),
        contentType: String(res.headers['content-type'] || ''),
        ms: Date.now() - started,
        error: '',
      }));
      stream.on('error', (e) => resolve({ ok: false, status, body: '', ms: Date.now() - started, error: e.message }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, body: '', ms: Date.now() - started, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, status: 0, body: '', ms: Date.now() - started, error: e.message }));
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ---------------------------------------------------------------- 판정 도우미

/** 200인데 본문이 HTML이면 API가 아니라 에러/폴백 페이지다. */
function looksLikeHtml(body) {
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function countJson(body, pick) {
  try {
    const parsed = JSON.parse(body);
    const list = pick(parsed);
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return -1; // 파싱 실패
  }
}

function countMatches(body, re) {
  return (body.match(re) || []).length;
}

/** 체크 결과 표준형 */
function verdict(level, detail, extra = {}) {
  return { level, detail, ...extra };
}

// ---------------------------------------------------------------- 체크 정의

const CHECKS = [];

function check(group, name, critical, run) {
  CHECKS.push({ group, name, critical, run });
}

// ── 1. 서버 (Vultr) — 공개 엔드포인트
const SERVER_ENDPOINTS = [
  { path: '/health', name: '헬스체크', pick: null },
  { path: '/v1/public/source-signals?limit=20', name: '실시간 검색어 공급', pick: (d) => d?.lanes },
  { path: '/v1/public/home-notices', name: '홈 공지(배지·모달 의존)', pick: (d) => d?.notices?.notices },
  { path: '/v1/public/home-keyword-briefing', name: '홈 황금키워드 브리핑', pick: (d) => d?.briefing?.rows || d?.rows },
  { path: '/v1/public/live-golden', name: '황금보드 공개 미리보기', pick: (d) => d?.items || d?.keywords },
  { path: '/v1/public/downloads', name: '다운로드 경로', pick: (d) => d?.downloads || d?.items },
  { path: '/v1/public/site-content', name: '사이트 콘텐츠', pick: null },
];

for (const ep of SERVER_ENDPOINTS) {
  check('server', `${ep.name} ${ep.path.split('?')[0]}`, true, async () => {
    const res = await fetchUrl(SERVER_BASE + ep.path);
    if (!res.ok) {
      return verdict('FAIL', `HTTP ${res.status || res.error}`, { ms: res.ms });
    }
    if (looksLikeHtml(res.body)) {
      return verdict('FAIL', '200이지만 본문이 HTML — API가 아니라 에러/폴백 페이지', { ms: res.ms });
    }
    if (ep.pick) {
      const n = countJson(res.body, ep.pick);
      if (n === -1) return verdict('FAIL', 'JSON 파싱 실패', { ms: res.ms });
      if (n === 0) return verdict('WARN', '200이지만 0건 — 무증상 실패 의심', { ms: res.ms, count: 0 });
      return verdict('PASS', `${n}건`, { ms: res.ms, count: n });
    }
    return verdict('PASS', `${res.body.length}B`, { ms: res.ms });
  });
}

// ── 2. 외부 수집 소스 (실시간/이슈)
check('sources', 'signal.bz 실시간(네이버 레인)', true, async () => {
  const res = await fetchUrl('https://api.signal.bz/news/realtime', { headers: { Referer: 'https://www.signal.bz/' } });
  if (!res.ok) return verdict('FAIL', `HTTP ${res.status || res.error}`, { ms: res.ms });
  const n = countJson(res.body, (d) => d?.top10);
  if (n <= 0) return verdict('FAIL', n === -1 ? 'JSON 파싱 실패' : '0건', { ms: res.ms });
  return verdict('PASS', `${n}건`, { ms: res.ms, count: n });
});

check('sources', '다음 실시간 트렌드', true, async () => {
  const res = await fetchUrl('https://www.daum.net/');
  if (!res.ok) return verdict('FAIL', `HTTP ${res.status || res.error}`, { ms: res.ms });
  // 실검 위젯이 사라지면 이 마커가 0이 된다(과거 셀렉터 노후화로 조용히 죽었던 지점).
  const n = countMatches(res.body, /realtime_trend/g);
  if (n === 0) return verdict('FAIL', 'realtime_trend 마커 0개 — 위젯 구조 변경 의심', { ms: res.ms });
  return verdict('PASS', `마커 ${n}개`, { ms: res.ms, count: n });
});

check('sources', 'ZUM 이슈검색어', false, async () => {
  const res = await fetchUrl('https://www.zum.com/');
  if (!res.ok) return verdict('WARN', `HTTP ${res.status || res.error}`, { ms: res.ms });
  const n = countMatches(res.body, /issue-word-list__keyword|issue_word/g);
  return n === 0
    ? verdict('WARN', '이슈 키워드 마커 0개', { ms: res.ms })
    : verdict('PASS', `마커 ${n}개`, { ms: res.ms, count: n });
});

check('sources', '네이버 자동완성(롱테일 공급 핵심)', true, async () => {
  const q = encodeURIComponent('제습기');
  const res = await fetchUrl(`https://ac.search.naver.com/nx/ac?q=${q}&st=100&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&frm=nv&q_enc=UTF-8`);
  if (!res.ok) return verdict('FAIL', `HTTP ${res.status || res.error}`, { ms: res.ms });
  const n = countJson(res.body, (d) => (d?.items || []).flat());
  if (n <= 0) return verdict('FAIL', '자동완성 0건 — 파라미터/차단 확인', { ms: res.ms });
  return verdict('PASS', `${n}건`, { ms: res.ms, count: n });
});

check('sources', '구글 자동완성', false, async () => {
  const q = encodeURIComponent('제습기');
  const res = await fetchUrl(`https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&ie=utf-8&oe=utf-8&q=${q}`);
  if (!res.ok) return verdict('WARN', `HTTP ${res.status || res.error}`, { ms: res.ms });
  const n = countJson(res.body, (d) => d?.[1]);
  return n <= 0 ? verdict('WARN', '0건', { ms: res.ms }) : verdict('PASS', `${n}건`, { ms: res.ms, count: n });
});

// ── 3. 정책 공급원 (키 필요 — 없으면 SKIP)
const WELFARE_KEY = (process.env.WELFARE_API_KEY || process.env.DATA_GO_KR_API_KEY || '').trim();

check('policy', '중앙부처 복지서비스 API', true, async () => {
  if (!WELFARE_KEY) return verdict('SKIP', 'WELFARE_API_KEY 미설정');
  const url = 'https://apis.data.go.kr/B554287/NationalWelfareInformationsV001/NationalWelfarelistV001'
    + `?serviceKey=${WELFARE_KEY}&callTp=L&pageNo=1&numOfRows=10&srchKeyCode=003&orderBy=popular`;
  const res = await fetchUrl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return verdict('FAIL', `HTTP ${res.status} — callTp 등 필수 파라미터 확인`, { ms: res.ms });
  const n = countJson(res.body, (d) => d?.servList);
  if (n <= 0) return verdict('FAIL', n === -1 ? '파싱 실패(XML 응답 가능성)' : '0건', { ms: res.ms });
  return verdict('PASS', `${n}건`, { ms: res.ms, count: n });
});

check('policy', '지자체 복지서비스 API', true, async () => {
  if (!WELFARE_KEY) return verdict('SKIP', 'WELFARE_API_KEY 미설정');
  const url = 'https://apis.data.go.kr/B554287/LocalGovernmentWelfareInformations/LcgvWelfarelist'
    + `?serviceKey=${WELFARE_KEY}&callTp=L&pageNo=1&numOfRows=10&srchKeyCode=003&arrgOrd=002`;
  const res = await fetchUrl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return verdict('FAIL', `HTTP ${res.status} — 오퍼레이션명은 LcgvWelfarelist`, { ms: res.ms });
  const n = countJson(res.body, (d) => d?.servList);
  if (n <= 0) return verdict('FAIL', n === -1 ? '파싱 실패' : '0건', { ms: res.ms });
  return verdict('PASS', `${n}건`, { ms: res.ms, count: n });
});

check('policy', '복지타임즈 RSS', false, async () => {
  const res = await fetchUrl('https://www.bokjitimes.com/rss/S1N1.xml');
  if (!res.ok) return verdict('WARN', `HTTP ${res.status || res.error}`, { ms: res.ms });
  const n = countMatches(res.body, /<item[\s>]/g);
  return n === 0 ? verdict('WARN', 'item 0건', { ms: res.ms }) : verdict('PASS', `${n}건`, { ms: res.ms, count: n });
});

// ── 4. 공개 사이트 (Cloudflare Pages — 서버와 독립)
check('site', 'leaderspro.kr 홈', true, async () => {
  const res = await fetchUrl(SITE_BASE + '/');
  if (!res.ok) return verdict('FAIL', `HTTP ${res.status || res.error}`, { ms: res.ms });
  if (res.body.length < 1000) return verdict('FAIL', `본문 ${res.body.length}B — 비정상`, { ms: res.ms });
  return verdict('PASS', `${(res.body.length / 1024).toFixed(0)}KB`, { ms: res.ms });
});

check('site', 'leaderspro.kr /leword 콘솔', true, async () => {
  const res = await fetchUrl(SITE_BASE + '/leword');
  if (!res.ok) return verdict('FAIL', `HTTP ${res.status || res.error}`, { ms: res.ms });
  return verdict('PASS', `${(res.body.length / 1024).toFixed(0)}KB`, { ms: res.ms });
});

// ---------------------------------------------------------------- 실행

async function runPool(items, worker, limit) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const ICON = { PASS: '✅', WARN: '⚠️ ', FAIL: '❌', SKIP: '⏭️ ', ERROR: '💥' };

async function main() {
  const args = process.argv.slice(2);
  const only = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
  const outPath = (args.find((a) => a.startsWith('--json=')) || '').split('=')[1] || '';
  const quiet = args.includes('--quiet');

  const targets = only ? CHECKS.filter((c) => c.group === only) : CHECKS;
  if (targets.length === 0) {
    console.error(`--only=${only} 에 해당하는 체크가 없습니다. (server|sources|policy|site)`);
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  console.log('='.repeat(74));
  console.log(`LEWORD 의존성 헬스 하네스   ${startedAt}`);
  console.log(`서버 ${SERVER_BASE}   사이트 ${SITE_BASE}`);
  console.log('='.repeat(74));

  const rows = await runPool(targets, async (c) => {
    let result;
    try {
      result = await c.run();
    } catch (error) {
      result = verdict('ERROR', String(error && error.message).slice(0, 120));
    }
    return { group: c.group, name: c.name, critical: c.critical, ...result };
  }, CONCURRENCY);

  let lastGroup = '';
  for (const r of rows) {
    if (quiet && (r.level === 'PASS' || r.level === 'SKIP')) continue;
    if (r.group !== lastGroup) {
      console.log(`\n[${r.group}]`);
      lastGroup = r.group;
    }
    const ms = r.ms !== undefined ? `${String(r.ms).padStart(5)}ms` : '       ';
    console.log(`  ${ICON[r.level] || '  '} ${r.name.padEnd(42)} ${ms}  ${r.detail}`);
  }

  const tally = rows.reduce((acc, r) => { acc[r.level] = (acc[r.level] || 0) + 1; return acc; }, {});
  const failed = rows.filter((r) => r.level === 'FAIL' || r.level === 'ERROR');
  const criticalFailed = failed.filter((r) => r.critical);

  console.log('\n' + '-'.repeat(74));
  console.log(`PASS ${tally.PASS || 0} · WARN ${tally.WARN || 0} · FAIL ${tally.FAIL || 0} · SKIP ${tally.SKIP || 0} · ERROR ${tally.ERROR || 0}`);
  if (criticalFailed.length > 0) {
    console.log(`\n즉시 조치 필요 (critical ${criticalFailed.length}건):`);
    criticalFailed.forEach((r) => console.log(`  ❌ [${r.group}] ${r.name} — ${r.detail}`));
  }
  console.log('-'.repeat(74));

  if (outPath) {
    fs.writeFileSync(outPath, JSON.stringify({ startedAt, serverBase: SERVER_BASE, tally, rows }, null, 2), 'utf8');
    console.log(`리포트 저장: ${outPath}`);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('하네스 자체 오류:', error);
  process.exit(2);
});
