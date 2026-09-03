#!/usr/bin/env node
/**
 * 실검 틈새 보드 — 한 회차를 돌려 원장(JSON)을 남긴다.
 *
 * 황금키워드보드와 같은 방식이다: 사장님 CI(구독 토큰)가 돌리고, 결과는 정적
 * 파일로 사이트에 발행된다. 방문자는 보기만 한다 — 방문자마다 돌리지 않는다.
 *
 * 한 회차의 비용(11차 라이브 실측 기준):
 *   구독 에이전트 1회(이슈 전부를 한 프롬프트에 묶는다) · 데이터랩 ≈26회 ·
 *   블로그 검색 ≈100회. 하루 3회면 데이터랩 1,000 한도의 8% 다.
 *
 * 자격증명: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (CI 시크릿 또는 .env).
 * 로컬에서는 앱 config.json(%APPDATA%/leword) 도 읽는다 — e2e 스크립트와 같다.
 *
 * 사용:
 *   node scripts/issue-niche-board.js --out=issue-board.json [--issueLimit=16] [--maxCandidates=80]
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const { huntIssueNicheKeywords, createAgentCandidateGenerator } = require('../src/utils/issue-niche-hunter');

/*
 * 배치 전용 모델 고정 — enrich-board.js 와 같은 결정. 사장님 기본 모델(최상위
 * 티어)의 한도는 사장님이 직접 쓰는 자리에 남긴다.
 */
const BATCH_CLAUDE_MODEL = 'opus';

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function loadNaverKeys() {
  if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
    return { clientId: process.env.NAVER_CLIENT_ID, clientSecret: process.env.NAVER_CLIENT_SECRET, from: 'env' };
  }
  const candidates = [
    path.join(process.env.APPDATA || '', 'leword', 'config.json'),
    path.join(process.env.APPDATA || '', 'blogger-admin-panel', 'config.json'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (cfg.naverClientId && cfg.naverClientSecret) {
        return { clientId: cfg.naverClientId, clientSecret: cfg.naverClientSecret, from: file };
      }
    } catch {
      // 다음 후보
    }
  }
  return null;
}

const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR'));

async function main() {
  const out = arg('out') || 'issue-board.json';
  const issueLimit = Number(arg('issueLimit')) || 16;
  const maxCandidates = Number(arg('maxCandidates')) || 80;
  const docCountMax = Number(arg('docCountMax')) || 3000;

  const keys = loadNaverKeys();
  if (!keys) {
    console.error('네이버 오픈 API 자격증명이 없다 — NAVER_CLIENT_ID / NAVER_CLIENT_SECRET.');
    process.exit(2);
  }
  console.log('='.repeat(70));
  console.log(`실검 틈새 보드 회차 — 이슈 ${issueLimit} · 후보 상한 ${maxCandidates} · 문서수 상한 ${fmt(docCountMax)}`);
  console.log(`  자격증명   ${keys.from}`);
  console.log(`  에이전트   구독 CLI (claude:${BATCH_CLAUDE_MODEL} → codex → gemini → grok)`);
  console.log('='.repeat(70));

  const startedAt = Date.now();
  let issues = 0;
  const rows = await huntIssueNicheKeywords({
    config: { clientId: keys.clientId, clientSecret: keys.clientSecret },
    issueLimit,
    maxCandidates,
    docCountMax,
    generateCandidates: createAgentCandidateGenerator({ claudeModel: BATCH_CLAUDE_MODEL }),
    onProgress: (p) => {
      if (p.phase === 'derive' && typeof p.total === 'number' && p.total > issues) issues = p.total;
      const pos = typeof p.current === 'number' && typeof p.total === 'number' ? ` (${p.current}/${p.total})` : '';
      console.log(`  · [${p.phase}] ${p.message || p.keyword || ''}${pos}`);
    },
  });
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

  const niche = rows.filter((r) => r.isNiche);
  const preemption = rows.filter((r) => !r.isNiche && r.isPreemption);
  const issueSet = new Set(rows.map((r) => r.baseKeyword));
  const ledger = {
    generator: 'issue-niche-hunter',
    generatedAt: new Date().toISOString(),
    elapsedSec,
    options: { issueLimit, maxCandidates, docCountMax },
    funnel: {
      issues: Math.max(issues, issueSet.size),
      candidates: rows.length,
      niche: niche.length,
      preemption: preemption.length,
      liveDemand: rows.filter((r) => r.hasLiveDemand).length,
      lowCompetition: rows.filter((r) => !r.isDocumentCountEstimated && typeof r.documentCount === 'number' && r.documentCount <= docCountMax).length,
    },
    rows,
  };
  fs.writeFileSync(out, JSON.stringify(ledger, null, 1), 'utf8');

  console.log('');
  console.log(`  실측       이슈 ${ledger.funnel.issues} → 후보 ${rows.length} → 틈새 ${niche.length} · 선점 후보 ${preemption.length}  (${elapsedSec}s)`);
  niche.slice(0, 10).forEach((r) => console.log(`    ◆ ${r.keyword}  [${r.baseKeyword}] 문서수 ${fmt(r.documentCount)} · 수요 ${r.hasLiveDemand ? '▲' : '—'}`));
  preemption.slice(0, 5).forEach((r) => console.log(`    ▷ ${r.keyword}  [${r.baseKeyword}] 문서수 ${fmt(r.documentCount)} · 선점 후보`));
  console.log(`  원장       ${out}`);

  if (rows.length === 0) {
    console.error('실측 행이 0 이다 — 공급원(Signal.bz/RSS) 또는 자격증명을 의심할 것.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`회차 실패: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
