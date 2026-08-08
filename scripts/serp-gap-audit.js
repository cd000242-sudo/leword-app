#!/usr/bin/env node
/**
 * SERP 공백 감사 — "문서수로 버린 후보 중 실제로는 먹을 수 있었던 게 몇 %인가"
 *
 * 판정 로직과 Bright Data 호출은 각각 모듈로 승격됐다. 이 스크립트는 이제
 * 그 둘을 엮어 사람이 읽는 리포트를 뽑는 얇은 껍데기다.
 *   - src/utils/brightdata-client.ts   호출(+쿼터 거버너 게이트)
 *   - src/utils/serp-winnability.ts    제목 커버리지 판정
 *
 * 사용법:
 *   BRIGHTDATA_TOKEN=xxx node scripts/serp-gap-audit.js --in=keywords.json [--limit=100] [--out=report.json]
 *   BRIGHTDATA_TOKEN=xxx node scripts/serp-gap-audit.js --keywords="키워드1,키워드2"
 */

require('ts-node/register/transpile-only');

const fs = require('fs');
const { brightDataFetch } = require('../src/utils/brightdata-client');
const { analyzeSerp, verdictFor } = require('../src/utils/serp-winnability');

const ZONE = process.env.BRIGHTDATA_ZONE || '77';
const DELAY_MS = 400;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  if (!(process.env.BRIGHTDATA_TOKEN || '').trim()) {
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
    const res = await brightDataFetch(url, 'golden', { zone: ZONE });
    if (!res.ok) {
      const why = res.quotaBlocked ? `쿼터차단(${res.error})` : (res.error || res.status);
      console.log(`  ?? ${keyword.padEnd(26)} 수집실패 ${why}`);
      rows.push({ keyword, error: String(why) });
      if (res.quotaBlocked) { console.log('  쿼터 한도에 도달해 중단합니다.'); break; }
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
