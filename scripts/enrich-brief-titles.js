#!/usr/bin/env node
/**
 * 실시간 브리프 제목 창고 만들기 — 구독 CLI 가 기사 사실만 보고 제목을 짓는다.
 *
 * ## 왜 여기서 만드나
 *
 * 사이트 크론(refresh-public-data.mjs)은 15분마다 데이터를 통째로 다시 만든다.
 * 밖에서 제목을 고쳐 넣어도 다음 회차에 지워지므로, 붙이려면 만드는 자리에서
 * 붙여야 한다. 그런데 사이트 저장소에는 구독 자격이 없다 — 있는 곳은 여기다.
 *
 * 그래서 여기서 키워드별 제목을 만들어 brief-titles.json 에 얹어 두고, 크론은
 * 키워드로 찾아 쓴다. 창고가 비거나 낡아도 크론은 템플릿으로 버틴다.
 *
 * ## 지어내지 않기
 *
 * 제목의 재료는 **그 키워드의 기사에서 실제로 확인된 문장**뿐이다. 기사에 없는
 * 숫자·이름·결과를 넣으면 그건 낚시가 아니라 거짓이다. 그래서 사실을 프롬프트에
 * 싣고, 돌아온 제목이 키워드를 품고 있는지까지 확인한 뒤에만 창고에 넣는다.
 *
 * 사용:
 *   node scripts/enrich-brief-titles.js --in=<source-signals.json> --out=<brief-titles.json> [--max=40]
 */
'use strict';

require('ts-node/register/transpile-only');

const fs = require('fs');
/** 창고 유효기간. 실시간 검색어는 하루면 대부분 갈린다. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** 한 번에 보낼 키워드 수. 너무 크면 한 건이 어긋날 때 전부 잃는다. */
const BATCH_SIZE = 8;

const { rejectedHome, usableTitle, subKeywordCandidates, homeTitleHasSub, collectRows, titlesForBatch } = require('../src/utils/brief-title-engine');

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function loadExisting(outPath) {
  try {
    if (!fs.existsSync(outPath)) return [];
    const raw = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const fresh = Date.now() - CACHE_TTL_MS;
    return (raw.titles || [])
      .filter((t) => Date.parse(String(t.at || '')) >= fresh)
      // 요약이 없는 항목은 옛 형식이다 — 유지하면 그 키워드는 TTL 이 끝날
      // 때까지 요약 없이 나간다. 즉시 만료시켜 다음 실행에서 다시 짓는다.
      .filter((t) => typeof t.summary === 'string' && t.summary.length > 0);
  } catch {
    return [];
  }
}

async function main() {
  const inPath = arg('in');
  const outPath = arg('out');
  const max = Number(arg('max')) || 40;
  if (!inPath || !outPath) {
    console.error('--in=<source-signals.json> --out=<brief-titles.json> 이 필요합니다.');
    process.exit(2);
  }

  const signals = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const kept = loadExisting(outPath);
  const keptKeywords = new Set(kept.map((t) => t.keyword));

  // 이미 창고에 있고 아직 안 낡은 것은 다시 만들지 않는다.
  const rows = collectRows(signals).filter((r) => !keptKeywords.has(r.keyword)).slice(0, max);
  console.log(`대상 ${rows.length}개 (창고 유지 ${kept.length}개) · 배치 ${BATCH_SIZE}`);

  const made = [];
  const stamp = new Date().toISOString();
  let provider = '';
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    try {
      const result = await titlesForBatch(batch);
      provider = result.provider || provider;
      for (const title of result.titles) made.push({ ...title, at: stamp });
      console.log(`  ✚ ${batch.length}개 요청 → ${result.titles.length}개 채택 (${result.provider})`);
    } catch (error) {
      console.log(`  !! 배치 실패(계속): ${String((error && error.message) || error).slice(0, 120)}`);
    }
  }

  if (rows.length > 0 && made.length === 0) {
    throw new Error('새로 생성한 유효 제목이 0건입니다. 기존 제목 창고를 유지합니다.');
  }
  const titles = [...kept, ...made];
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: stamp,
    provider,
    total: titles.length,
    titles,
  }, null, 2), 'utf8');

  if (rejectedHome.length > 0) {
    console.log(`\n홈판 규격 미달 ${rejectedHome.length}건 (메인+서브+후킹 중 서브 누락):`);
    for (const line of rejectedHome.slice(0, 8)) console.log(`  - ${line}`);
  }
  console.log(`\n제목 창고 저장: ${titles.length}건 (새로 ${made.length}건) → ${outPath}`);
}

// 규격 판정은 테스트로 못 박는다 — 직접 실행할 때만 본체가 돈다.
module.exports = { homeTitleHasSub, subKeywordCandidates, usableTitle };

if (require.main === module) {
  main().catch((error) => { console.error('제목 창고 생성 실패:', error); process.exit(1); });
}
