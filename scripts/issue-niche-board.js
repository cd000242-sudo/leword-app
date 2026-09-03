#!/usr/bin/env node
/**
 * 실검 틈새 보드 — 한 회차를 돌려 원장(JSON)을 남긴다.
 *
 * 황금키워드보드와 같은 방식이다: 사장님 CI(구독 토큰)가 돌리고, 결과는 정적
 * 파일로 사이트에 발행된다. 방문자는 보기만 한다 — 방문자마다 돌리지 않는다.
 *
 * 한 회차의 비용(11차 라이브 실측 기준):
 *   구독 에이전트 1회(이슈 전부를 한 프롬프트에 묶는다) · 데이터랩 ≈26회 ·
 *   블로그 검색 ≈100회 · 뉴스 검색 이슈당 1회 · 자동완성 이슈당 1회 ·
 *   검색광고 연관어 이슈당 1회. 하루 3회면 데이터랩 1,000 한도의 8% 다.
 *
 * 자격증명: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (CI 시크릿 또는 .env).
 * 검색광고 자격(NAVER_SEARCH_AD_*)이 있으면 연관검색어까지 싣는다.
 * 로컬에서는 앱 config.json(%APPDATA%/leword) 도 읽는다 — e2e 스크립트와 같다.
 *
 * 산출물 두 개:
 *   --out       원장 전체(실측 행 전부 + 이슈 추론). 보관용.
 *   --picksOut  틈새·선점 후보만 골라 황금 보강기(enrich-board.js)가 읽는 모양으로
 *               낸 것. 보강 → 발행(publish-issue-niche-board.js)이 이걸 읽는다.
 *
 * 사용:
 *   node scripts/issue-niche-board.js --out=issue-board.json --picksOut=issue-board-picks.json [--issueLimit=16] [--maxCandidates=80]
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const path = require('path');
const { huntIssueNicheBoard } = require('../src/utils/issue-niche-hunter');
const { createAgentIssueAnalyzer } = require('../src/utils/issue-next-wave');
const { selectIssueRowsForEnrich } = require('../src/utils/issue-niche-board-publish');

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
  const picksOut = arg('picksOut') || '';
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
  const { rows, issues: issueRows } = await huntIssueNicheBoard({
    config: { clientId: keys.clientId, clientSecret: keys.clientSecret },
    issueLimit,
    maxCandidates,
    docCountMax,
    analyzeIssues: createAgentIssueAnalyzer({
      claudeModel: BATCH_CLAUDE_MODEL,
      onError: (message) => console.warn(`  ! 에이전트: ${message}`),
    }),
    onProgress: (p) => {
      if (p.phase === 'derive' && typeof p.total === 'number' && p.total > issues) issues = p.total;
      const pos = typeof p.current === 'number' && typeof p.total === 'number' ? ` (${p.current}/${p.total})` : '';
      /* context 는 이슈마다 한 줄이라 시끄럽다 — 진행 위치만 남긴다. */
      if (p.phase === 'context' && p.keyword && !p.message) {
        if (p.current === p.total) console.log(`  · [context] 재료 수집 끝${pos}`);
        return;
      }
      console.log(`  · [${p.phase}] ${p.message || p.keyword || ''}${pos}`);
    },
  });
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

  const niche = rows.filter((r) => r.isNiche);
  const pending = rows.filter((r) => r.isPending);
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
      pending: pending.length,
      preemption: preemption.length,
      trafficGate: rows.filter((r) => r.trafficGate).length,
      demandGate: rows.filter((r) => r.demandGate).length,
      liveDemand: rows.filter((r) => r.hasLiveDemand).length,
      lowCompetition: rows.filter((r) => !r.isDocumentCountEstimated && typeof r.documentCount === 'number' && r.documentCount <= docCountMax).length,
    },
    rows,
    issues: issueRows,
  };
  fs.writeFileSync(out, JSON.stringify(ledger, null, 1), 'utf8');
  const picks = picksOut ? selectIssueRowsForEnrich(ledger) : null;
  if (picks) fs.writeFileSync(picksOut, JSON.stringify(picks, null, 1), 'utf8');

  console.log('');
  console.log(`  실측       이슈 ${ledger.funnel.issues} → 후보 ${rows.length} → 트래픽 ${ledger.funnel.trafficGate} · 수요 ${ledger.funnel.demandGate} → 자리 대기 ${pending.length} · 틈새 ${niche.length} · 선점 후보 ${preemption.length}  (${elapsedSec}s)`);
  const reasoned = issueRows.filter((i) => i.why).length;
  const waves = issueRows.reduce((n, i) => n + i.nextWave.length, 0);
  const headlined = issueRows.filter((i) => i.headlines.length > 0).length;
  console.log(`  추론       헤드라인 있는 이슈 ${headlined}/${issueRows.length} · "왜" 검증 통과 ${reasoned} · 다음 물결 ${waves}`);
  issueRows.filter((i) => i.why).slice(0, 6).forEach((i) => console.log(`    ? ${i.issue}: ${i.why}`));
  niche.slice(0, 10).forEach((r) => console.log(`    ◆ ${r.keyword}  [${r.baseKeyword}] 문서수 ${fmt(r.documentCount)} · 수요 ${r.hasLiveDemand ? '▲' : '—'}`));
  preemption.slice(0, 5).forEach((r) => console.log(`    ▷ ${r.keyword}  [${r.baseKeyword}] 문서수 ${fmt(r.documentCount)} · 선점 후보`));
  console.log(`  원장       ${out}`);
  if (picks) console.log(`  보강 대상  ${picksOut} (${picks.rows.length}행 · 애드센스 적합 ${picks.rows.filter((r) => r.adsenseFit === true).length})`);

  if (rows.length === 0) {
    console.error('실측 행이 0 이다 — 공급원(Signal.bz/RSS) 또는 자격증명을 의심할 것.');
    process.exit(1);
  }
}

/*
 * 명시적 종료 — enrich-board.js 와 같다. 헌터가 남긴 핸들(에이전트 CLI·keep-alive)이
 * 이벤트 루프를 붙들어, 첫 CI 회차가 152초에 끝나고도 30분 타임아웃까지 매달렸다.
 */
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`회차 실패: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exit(1);
  });
