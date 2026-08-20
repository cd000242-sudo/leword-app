#!/usr/bin/env node
/**
 * 제휴 상품 AI 제목 — 구독 CLI 가 제품을 읽고 추론해서 짓는다.
 *
 * 사장님 지시(2026-08-20): "규칙 풀은 구시대적이다. 크롤링한 제품의 스펙과
 * 내용을 보고 추론해서 제목 방향을 정하고 생성하게끔 해야 한다."
 *
 * 홈판 보강(enrich-board.js)과 같은 구조다:
 *   재료(전부 실측) → 구독 CLI 추론 → 규칙 검증 → 통과분만 스냅샷에 실림.
 *   AI 가 없거나 검증 탈락이면 화면의 규칙 조립 제목(shoppingTitle.ts)이 폴백.
 *
 * 추론 순서를 프롬프트로 강제한다:
 *   ① 제품 파악 → 구매 판단이 갈리는 축 추론 (당연한 기능 결과는 축이 아니다)
 *   ② 그 축에서 제목 방향 결정 → 제품명+니즈 검색어+후킹 제목 생성
 *   ③ whyClick 자가검증 — 클릭 이유가 안 써지면 버리고 다시
 *
 * 사용:
 *   affiliate-campaigns-parse.js 가 마지막 단계로 부른다 (--noAi 로 건너뜀)
 *   단독 재생성: node scripts/affiliate-ai-titles.js [--in=tmp/affiliate-campaigns-public.json]
 */
'use strict';

require('ts-node/register/transpile-only');

const fs = require('fs');
const path = require('path');

const { runClaude } = require('../src/utils/agent-cli/claudeRunner');
const { runCodex } = require('../src/utils/agent-cli/codexRunner');
const { runGemini } = require('../src/utils/agent-cli/geminiRunner');
const { runGrok } = require('../src/utils/agent-cli/grokRunner');
const { runWithAnyAgent } = require('../src/utils/agent-cli/runAny');
const { tryExtractJson } = require('../src/utils/agent-cli/parse');

// 배치는 오푸스 고정 — 페이블5 한도는 사장님이 직접 쓰는 자리에 남긴다(enrich-board 와 동일).
const BATCH_CLAUDE_MODEL = 'opus';
const AGENT_CHAIN = [
  { provider: 'claude', run: (p, o) => runClaude(p, { ...(o || {}), model: BATCH_CLAUDE_MODEL }) },
  { provider: 'codex', run: runCodex },
  { provider: 'gemini', run: runGemini },
  { provider: 'grok', run: runGrok },
];
const AI_TIMEOUT_MS = 120_000;
const BATCH_SIZE = 6;

/** 광고 규제어·라벨형 상투구 — 검증기와 프롬프트가 같은 목록을 봐야 한다. */
const BANNED_RE = /(1위|최저가|무조건|100\s*%|필수템|인생템|오늘만|품절\s*임박|총정리|핵심\s*정리|한눈에|알아보)/;

/** 프롬프트·검증에 쓰는 가벼운 상품명 정리 — 행사 괄호와 콤마 옵션만 걷는다. */
function displayName(raw) {
  return String(raw || '')
    .replace(/^\s*(\[[^\]]*\]|\([^)]*\))\s*/g, '')
    .split(',')[0]
    .replace(/\s+/g, ' ')
    .trim();
}

/** 제목 앵커 — 핵심 검색어의 첫 어절(브랜드). 없으면 정리된 상품명의 첫 어절. */
function anchorToken(item) {
  const source = String(item.keyword || '').trim() || displayName(item.name);
  return source.split(/\s+/)[0] || '';
}

function buildPrompt(items) {
  const lines = items.map((item, index) => {
    const parts = [
      `상품명: ${displayName(item.name)}`,
      item.brand ? `브랜드/스토어: ${item.brand}` : '',
      item.price ? `가격: ${Number(item.price).toLocaleString('ko-KR')}원` : '',
      item.reward ? `조건: ${item.reward}` : '',
      item.needKeyword
        ? `니즈 검색어(실측): "${item.needKeyword}" 월 ${item.needVolume ? Number(item.needVolume).toLocaleString('ko-KR') : '—'}`
          + `${item.needDocs != null ? ` · 블로그 문서 ${Number(item.needDocs).toLocaleString('ko-KR')}` : ''}`
        : '니즈 검색어: 없음(상품명 검색어만)',
      item.keyword ? `상품명 검색어: ${item.keyword} (월 ${item.searchVolume ?? '—'})` : '',
      item.serpTop && item.serpTop.sampled
        ? `블로그 상위${item.serpTop.sampled} 정면 대응 글: ${item.serpTop.exact}개` : '',
    ].filter(Boolean);
    return `[${index}]\n  ${parts.join('\n  ')}`;
  });

  return [
    '너는 제휴 쇼핑 블로그의 제목 전문가다. 아래는 실제 판매 중인 상품들의 실측 데이터다.',
    '',
    '각 상품마다 이 순서로 작업하라:',
    '① 상품명·가격·카테고리에서 이 제품이 무엇인지 파악하고, **구매 판단이 갈리는 축**을 추론하라.',
    '   (예: 관리 부담, 소음 기준, 우리 집·내 몸과의 궁합, 유지 비용, 윗급 모델 대비 차이, 리뷰가 갈리는 지점)',
    '   당연한 기능 결과는 축이 아니다 — "로봇청소기를 돌리면 깨끗해진다", "선풍기는 시원하다"는',
    '   독자가 이미 알아서 클릭 이유가 못 된다. 그런 축이 나오면 버리고 다시 추론하라.',
    '② 그 축에서 제목 방향을 정하고 블로그 글 제목 1개를 지어라.',
    '   공식: 정리된 제품명(브랜드+모델, 행사문구 제거) + 니즈 검색어의 어절 + 클릭할 수밖에 없는 후킹.',
    '   - 후킹은 ①에서 추론한 축에서 나와야 한다. 42자 이내, 구어체.',
    '   - 금지: 1위·최저가·무조건·100%·필수템·인생템·오늘만·품절임박(광고 규제),',
    '     총정리·핵심정리·한눈에(라벨형), 실측에 없는 수치·기간·체험 디테일 날조.',
    '③ whyClick: "이 제품 구매를 고민 중인 사람이 이 제목을 클릭하는 이유" 1문장.',
    '   자연스럽게 안 써지면 그 제목을 버리고 ①부터 다시 하라. "궁금해서"류 빈말은 실패다.',
    '',
    '상품 목록:',
    ...lines,
    '',
    '최종 출력(JSON 배열만, 다른 말 금지):',
    '[{"index":0,"axis":"갈리는 축 한 줄","title":"제목","whyClick":"클릭 이유 1문장"}, ...]',
  ].join('\n');
}

/**
 * AI 제목 검증 — 통과 못 하면 버리고 규칙 폴백이 남는다.
 * 앵커(브랜드 어절) 포함 · 금지어 없음 · 길이 12~52 · 원시 상품명 복사 아님.
 */
function validateTitle(item, raw) {
  const title = String(raw || '').replace(/\s+/g, ' ').trim();
  if (title.length < 12 || title.length > 52) return null;
  if (BANNED_RE.test(title)) return null;
  const anchor = anchorToken(item);
  if (anchor && !title.includes(anchor)) return null;
  const compact = (t) => t.replace(/\s+/g, '').toLowerCase();
  if (compact(title) === compact(displayName(item.name))) return null;
  return title;
}

/**
 * 사이트별 아이템에 aiTitle 을 붙인다(불변 — 새 배열을 돌려준다).
 * 배치 하나가 실패해도 나머지는 계속 간다 — 실패분은 규칙 폴백으로 나간다.
 */
async function attachAiTitles(items, { label = '', log = console.log } = {}) {
  const out = [...items];
  let attached = 0;
  for (let i = 0; i < out.length; i += BATCH_SIZE) {
    const batch = out.slice(i, i + BATCH_SIZE);
    try {
      const run = await runWithAnyAgent(buildPrompt(batch), AGENT_CHAIN, { timeoutMs: AI_TIMEOUT_MS });
      const parsed = tryExtractJson(run.reply);
      if (!Array.isArray(parsed)) throw new Error('JSON 배열이 아님');
      for (const row of parsed) {
        const at = Number(row && row.index);
        if (!Number.isInteger(at) || at < 0 || at >= batch.length) continue;
        const item = batch[at];
        const title = validateTitle(item, row.title);
        if (!title) continue;
        out[i + at] = {
          ...item,
          aiTitle: {
            text: title,
            axis: String(row.axis || '').replace(/\s+/g, ' ').trim().slice(0, 80),
            whyClick: String(row.whyClick || '').replace(/\s+/g, ' ').trim().slice(0, 120),
            provider: run.provider,
          },
        };
        attached += 1;
      }
      log(`  🤖 ${label} ${i + 1}~${i + batch.length} — ${run.provider} · 제목 ${attached}개 누적`);
    } catch (error) {
      log(`  !! ${label} ${i + 1}~${i + batch.length} AI 실패(규칙 폴백 유지): ${String(error.message || error).slice(0, 80)}`);
    }
  }
  return { items: out, attached };
}

module.exports = { attachAiTitles, validateTitle, displayName };

// ── 단독 실행: 기존 스냅샷에 AI 제목만 다시 입힌다(실측 재호출 없음) ──────
if (require.main === module) {
  (async () => {
    const argIn = process.argv.find((a) => a.startsWith('--in='));
    const inPath = argIn
      ? argIn.slice(5)
      : path.join(__dirname, '..', 'tmp', 'affiliate-campaigns-public.json');
    const payload = JSON.parse(fs.readFileSync(inPath, 'utf8'));
    let total = 0;
    for (const [id, site] of Object.entries(payload.sites || {})) {
      const result = await attachAiTitles(site.items || [], { label: site.label || id });
      site.items = result.items;
      total += result.attached;
      for (const item of site.items) {
        if (item.aiTitle) console.log(`    · ${item.aiTitle.text}  [축: ${item.aiTitle.axis}]`);
      }
    }
    fs.writeFileSync(inPath, JSON.stringify(payload, null, 1), 'utf8');
    console.log(`\nAI 제목 ${total}개 → ${inPath}`);
  })().catch((error) => { console.error('실패:', error.message); process.exit(1); });
}
