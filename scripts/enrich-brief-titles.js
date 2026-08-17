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
const { runClaude } = require('../src/utils/agent-cli/claudeRunner');
const { runCodex } = require('../src/utils/agent-cli/codexRunner');
const { runGemini } = require('../src/utils/agent-cli/geminiRunner');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');
const { tryExtractJson } = require('../src/utils/agent-cli/parse');

const AGENT_CHAIN = [
  { provider: 'claude', run: runClaude },
  { provider: 'codex', run: runCodex },
  { provider: 'gemini', run: runGemini },
];

const AI_TIMEOUT_MS = 120_000;
/** 창고 유효기간. 실시간 검색어는 하루면 대부분 갈린다. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** 한 번에 보낼 키워드 수. 너무 크면 한 건이 어긋날 때 전부 잃는다. */
const BATCH_SIZE = 8;

/** 규격 미달로 버린 홈판 제목 — 프롬프트를 고칠 때 이 목록이 근거가 된다. */
const rejectedHome = [];

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

/** 제목이 재료 밖으로 나갔는지 본다 — 키워드조차 없으면 딴소리다. */
function usableTitle(text, keyword) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length < 6 || value.length > 90) return '';
  const head = String(keyword || '').split(/\s+/)[0] || '';
  if (head && !value.includes(head)) return '';
  return value;
}

const tokensOf = (text) => String(text || '')
  .split(/[\s,·・/|]+/)
  .map((t) => t.replace(/[^0-9A-Za-z가-힣]/g, ''))
  .filter((t) => t.length >= 2);

/**
 * 서브키워드 후보 — 자동완성 실측 중 **메인키워드를 실제로 품은 것**만.
 *
 * 자동완성은 노이즈가 많다. "안세영, 복귀전 32강 진출"의 확장어로 '진출 뜻',
 * 't1 월즈 진출'이 올라온다 — 뒷토막('진출')만 맞은 남의 검색어다. 이런 걸
 * 서브키워드로 쓰면 제목이 엉뚱한 주제로 끌려간다.
 *
 * 돌려주는 것은 "메인 다음에 붙는 말"이다. '블랙핑크 리사' → '리사'.
 */
function subKeywordCandidates(keyword, expansions) {
  const mainTokens = new Set(tokensOf(keyword));
  const head = String(keyword || '').split(/\s+/)[0] || '';
  const out = [];
  const seen = new Set();
  for (const expansion of expansions || []) {
    const text = String(expansion || '').trim();
    if (!head || !text.includes(head)) continue;
    const extra = tokensOf(text).filter((t) => !mainTokens.has(t));
    for (const token of extra) {
      if (seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out.slice(0, 8);
}

/**
 * 홈판은 메인 + 서브 + 후킹이다. 서브가 안 들어갔으면 규격 미달로 버린다.
 *
 * 서브로 인정하는 것은 **메인 밖의 실측 낱말** 두 가지다:
 *   1. 자동완성에서 온 말 — 사람들이 실제로 이어서 치는 검색어
 *   2. 기사 사실 문장에 나온 말 — 실측 문장에서 온 것이라 근거는 같다
 *
 * 둘 중 하나면 된다. 자동완성만 인정하면 그날 처음 뜬 이슈가 전부 탈락하고,
 * 실제로 "경남 거제 570㎜ 호우, 도로 아스팔트 뜯겨나갔다" 같은 좋은 제목이
 * 버려졌다(2026-08-18 실측). 자동완성은 노이즈가 섞이므로 있다고 해서 그것만
 * 강요할 수 없다.
 */
function homeTitleHasSub(text, subs, facts, keyword) {
  /*
   * 메인키워드 낱말은 서브로 칠 수 없다. 안 빼면 "경남 거제 호우 최신 이슈
   * 정리" 같은 상투구도 '거제'가 사실에 있다는 이유로 통과한다.
   */
  /*
   * 낱말 단위 정확 일치로 보면 안 된다 — 한국어는 조사가 붙는다. '제니'를 서브로
   * 줬는데 제목에는 '제니도'로 들어가서 멀쩡한 제목이 탈락했다(2026-08-18 실측).
   * 그래서 포함 여부로 본다. 두 글자 이상만 세므로 우연히 걸릴 일은 없다.
   */
  const mainTokens = tokensOf(keyword);
  const isMain = (token) => mainTokens.some((m) => m === token);
  const haystack = String(text || '');

  if (subs.some((sub) => !isMain(sub) && haystack.includes(sub))) return true;

  const factTokens = facts.flatMap((f) => tokensOf(f)).filter((t) => !isMain(t));
  return factTokens.some((t) => haystack.includes(t));
}

function collectRows(signals) {
  const rows = [];
  for (const lane of signals.lanes || []) {
    for (const item of lane.items || []) {
      const keyword = String(item.keyword || item.title || '').trim();
      const facts = ((item.insight || {}).facts || [])
        .map((f) => String(f.text || '').trim())
        .filter(Boolean)
        .slice(0, 3);
      if (!keyword || facts.length === 0) continue;
      rows.push({
        keyword,
        lane: lane.label || lane.id || '',
        facts,
        subs: subKeywordCandidates(keyword, item.expansions || []),
      });
    }
  }
  // 같은 키워드가 여러 레인에 겹친다 — 한 번만 만든다.
  const seen = new Set();
  return rows.filter((r) => (seen.has(r.keyword) ? false : (seen.add(r.keyword), true)));
}

function buildPrompt(batch) {
  return [
    '너는 한국어 블로그 제목 전문가다. 아래 각 검색어에 대해 제목 두 개를 지어라.',
    '',
    '재료는 함께 준 "사실" 문장뿐이다. 사실에 없는 숫자·이름·결과·추측을 넣지 마라.',
    '',
    '- seo: 검색해서 들어올 사람을 위한 제목. 검색어를 앞쪽에 두고 40자 이내.',
    '',
    '- home: 홈 목록에서 **누를 수밖에 없게** 만드는 제목. 38자 이내.',
    '  반드시 이 세 가지가 모두 들어간다:',
    '    (1) 메인 검색어',
    '    (2) 함께 준 "서브" 낱말 중 하나 (없으면 사실 문장에 나온 낱말)',
    '    (3) 후킹 — 사실 중 사람들이 가장 궁금해할 지점',
    '  후킹은 사실 안에서 만든다. 없는 결과·수치·감정을 지어내면 안 된다.',
    '  숫자·고유명사처럼 구체적인 것이 가장 강한 후킹이다.',
    '',
    '- 두 제목 모두 검색어의 첫 단어를 반드시 포함한다.',
    '- "최신 이슈와 핵심 내용 정리", "관련 확인할 점", "총정리", "한눈에" 같은',
    '  상투구 금지. 아무 기사에나 갖다 붙일 수 있는 문장이면 실패다.',
    '',
    '- summary: 기사에서 무슨 일이 있었는지 **두 문장**으로. 90자 이내.',
    '  기사 원문을 그대로 옮기지 말고 핵심만 남긴다. 사실에 없는 말은 넣지 않는다.',
    '  "~라고 밝혔다" 식 인용 나열 대신, 무엇이 어떻게 됐는지를 먼저 쓴다.',
    '',
    'JSON 배열로만 출력한다: [{"keyword":"...","seo":"...","home":"...","summary":"..."}]',
    '',
    ...batch.map((row, i) => [
      `${i + 1}) 검색어: ${row.keyword}`,
      row.subs.length ? `   서브: ${row.subs.join(', ')}` : '   서브: (없음 — 사실에서 골라라)',
      ...row.facts.map((f) => `   사실: ${f.slice(0, 160)}`),
    ].join('\n')),
  ].join('\n');
}

async function titlesForBatch(batch) {
  const run = await runWithAnyAgent(buildPrompt(batch), AGENT_CHAIN, { timeoutMs: AI_TIMEOUT_MS });
  const parsed = tryExtractJson(run.reply);
  if (!Array.isArray(parsed)) return { provider: run.provider, titles: [] };

  const byKeyword = new Map(batch.map((row) => [row.keyword, row]));
  const titles = [];
  for (const entry of parsed) {
    const keyword = String((entry || {}).keyword || '').trim();
    if (!byKeyword.has(keyword)) continue;      // 안 준 검색어를 지어 왔다 — 버린다
    const row = byKeyword.get(keyword);
    const seo = usableTitle(entry.seo, keyword);
    let home = usableTitle(entry.home, keyword);
    // 서브키워드가 안 들어간 홈판은 규격 미달이다 — 메인+후킹만으로는 안 된다.
    if (home && !homeTitleHasSub(home, row.subs, row.facts, keyword)) {
      rejectedHome.push(`${keyword} — 서브 없음: ${home}`);
      home = '';
    }
    /*
     * 요약도 사실에 붙들어 맨다 — 기사에 없는 낱말만으로 이루어진 요약은
     * 지어낸 것이다. 사실 문장의 낱말을 하나도 안 쓰면 버린다.
     */
    const summaryRaw = String(entry.summary || '').replace(/\s+/g, ' ').trim();
    const factTokens = row.facts.flatMap((f) => tokensOf(f));
    const summary = (summaryRaw.length >= 15 && summaryRaw.length <= 140
      && factTokens.some((t) => summaryRaw.includes(t)))
      ? summaryRaw
      : '';

    if (!seo && !home && !summary) continue;
    titles.push({
      keyword,
      ...(seo ? { seo } : {}),
      ...(home ? { home } : {}),
      ...(summary ? { summary } : {}),
      provider: run.provider,
    });
  }
  return { provider: run.provider, titles };
}

function loadExisting(outPath) {
  try {
    if (!fs.existsSync(outPath)) return [];
    const raw = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    const fresh = Date.now() - CACHE_TTL_MS;
    return (raw.titles || []).filter((t) => Date.parse(String(t.at || '')) >= fresh);
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
