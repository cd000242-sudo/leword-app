/**
 * 이슈 황금 틈새 헌터 라이브 e2e
 *  - Signal.bz 실시간 이슈 → 에이전트 후보생성(폴백: 자동완성) → 네이버 실측 → 틈새 판정
 *  - never-empty 교리(틈새 0 방지)가 실주행에서 지켜지는지 확인한다.
 *
 * 실행: npx ts-node scripts/e2e-issue-niche-live.ts [issueLimit] [maxCandidates]
 */

import * as fs from 'fs';
import * as path from 'path';
import { huntIssueNicheKeywords, IssueNicheKeyword } from '../src/utils/issue-niche-hunter';

function loadKeys(): { id: string; secret: string } | null {
  const candidatePaths = [
    path.join(process.env.APPDATA || '', 'leword', 'config.json'),
    path.join(process.env.APPDATA || '', 'blogger-admin-panel', 'config.json'),
  ];
  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (cfg.naverClientId && cfg.naverClientSecret) {
          console.log(`[KEYS] found: ${p}`);
          return { id: cfg.naverClientId, secret: cfg.naverClientSecret };
        }
      }
    } catch {}
  }
  if (process.env['NAVER_CLIENT_ID'] && process.env['NAVER_CLIENT_SECRET']) {
    console.log('[KEYS] found: env');
    return { id: process.env['NAVER_CLIENT_ID']!, secret: process.env['NAVER_CLIENT_SECRET']! };
  }
  return null;
}

function fmt(v: number | null): string {
  return v === null || v === undefined ? '-' : Number(v).toLocaleString();
}

(async () => {
  const issueLimit = Number(process.argv[2] || 8);
  const maxCandidates = Number(process.argv[3] || 60);

  const keys = loadKeys();
  if (!keys) {
    console.error('❌ 네이버 API 키를 찾지 못했습니다 (config.json / NAVER_CLIENT_ID)');
    process.exit(1);
  }

  console.log('═'.repeat(72));
  console.log(`🎯 이슈 황금 틈새 헌터 라이브 — 이슈 ${issueLimit}개 / 후보 상한 ${maxCandidates}`);
  console.log('═'.repeat(72));

  const t0 = Date.now();
  let streamed = 0;
  let results: IssueNicheKeyword[] = [];
  try {
    results = await huntIssueNicheKeywords({
      config: { clientId: keys.id, clientSecret: keys.secret },
      issueLimit,
      maxCandidates,
      onProgress: (p) => {
        const pos = typeof p.current === 'number' && typeof p.total === 'number' ? ` (${p.current}/${p.total})` : '';
        console.log(`   · [${p.phase}] ${p.message || p.keyword || ''}${pos}`);
      },
      onCandidate: () => { streamed += 1; },
    });
  } catch (error: any) {
    console.error(`❌ 헌터 실패: ${error?.message || error}`);
    process.exit(1);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

  const niche = results.filter((r) => r.isNiche);
  const estimated = results.filter((r) => r.isEstimated);
  const grades = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.grade] = (acc[r.grade] || 0) + 1;
    return acc;
  }, {});
  const bases = new Set(results.map((r) => r.baseKeyword));

  console.log('');
  console.log('─'.repeat(72));
  console.log(`⏱️  ${elapsed}초 | 결과 ${results.length}개 (스트리밍 ${streamed}) | 원 이슈 ${bases.size}개`);
  console.log(`📊 등급 ${JSON.stringify(grades)}`);
  const liveDemand = results.filter((r) => r.hasLiveDemand).length;
  console.log(`💎 틈새(isNiche) ${niche.length}개 | 추정치 포함 ${estimated.length}개 | 파생 ${results.filter((r) => r.isDerived).length}개`);
  console.log(`📡 데이터랩 실측 수요 잡힌 키워드 ${liveDemand}/${results.length}개`);
  console.log('─'.repeat(72));

  // ── 게이트 퍼널 — 어느 조건이 후보를 죽이는지 숫자로 본다 (판정에 영향 없음, 관측만)
  const DOC_MAX = 3000, RATIO_MIN = 3, VOL_FLOOR = 100;
  const lowComp = results.filter((r) => r.documentCount != null && r.documentCount > 0 && r.documentCount <= DOC_MAX);
  const docMeasured = results.filter((r) => !r.isDocumentCountEstimated && r.documentCount != null && r.documentCount > 0);
  const alive = results.filter((r) => r.recencyStatus !== 'dead');
  const notFlooded = results.filter((r) => (r.freshFrontalCount ?? 0) < 3);
  const hasVol = results.filter((r) => r.searchVolume != null && !r.isSearchVolumeEstimated);
  const volOk = hasVol.filter((r) => (r.searchVolume as number) >= VOL_FLOOR);
  const ratioOk = results.filter((r) => r.goldenRatio != null && r.goldenRatio >= RATIO_MIN);
  const live = results.filter((r) => r.hasLiveDemand);
  const pct = (n: number) => `${n}/${results.length} (${Math.round((n / Math.max(1, results.length)) * 100)}%)`;

  console.log('');
  console.log('🔬 게이트 퍼널 (단독 통과율)');
  console.log(`   저경쟁 문서수<=${DOC_MAX}   : ${pct(lowComp.length)}`);
  console.log(`   문서수 실측(추정 아님)   : ${pct(docMeasured.length)}`);
  console.log(`   검색량 실측              : ${pct(hasVol.length)}   → 하한 ${VOL_FLOOR}+ 통과 ${pct(volOk.length)}`);
  console.log(`   황금비율 >= ${RATIO_MIN}          : ${pct(ratioOk.length)}`);
  console.log(`   데이터랩 실측 수요       : ${pct(live.length)}`);
  console.log(`   수요 살아있음(dead 아님) : ${pct(alive.length)}`);
  console.log(`   도배 아님                : ${pct(notFlooded.length)}`);
  console.log('🔬 경로별 누적 교집합');
  const volChain: [string, (r: IssueNicheKeyword) => boolean][] = [
    ['검색량 실측', (r) => r.searchVolume != null && !r.isSearchVolumeEstimated],
    [`+ 하한 ${VOL_FLOOR}+`, (r) => (r.searchVolume ?? 0) >= VOL_FLOOR],
    [`+ 저경쟁 <=${DOC_MAX}`, (r) => r.documentCount != null && r.documentCount > 0 && r.documentCount <= DOC_MAX],
    [`+ 황금비 >=${RATIO_MIN}`, (r) => r.goldenRatio != null && r.goldenRatio >= RATIO_MIN],
    ['+ dead 아님', (r) => r.recencyStatus !== 'dead'],
    ['+ 도배 아님', (r) => (r.freshFrontalCount ?? 0) < 3],
  ];
  const demChain: [string, (r: IssueNicheKeyword) => boolean][] = [
    ['데이터랩 실측 수요', (r) => r.hasLiveDemand],
    ['+ 문서수 실측', (r) => !r.isDocumentCountEstimated && r.documentCount != null && r.documentCount > 0],
    [`+ 저경쟁 <=${DOC_MAX}`, (r) => (r.documentCount as number) <= DOC_MAX],
    ['+ dead 아님', (r) => r.recencyStatus !== 'dead' && r.demandStatus !== 'dead'],
    ['+ 도배 아님', (r) => (r.freshFrontalCount ?? 0) < 3],
  ];
  for (const [label, chain] of [['volume 경로', volChain], ['demand 경로', demChain]] as [string, typeof volChain][]) {
    let alive2 = results;
    console.log(`   [${label}]`);
    for (const [step, fn] of chain) {
      alive2 = alive2.filter(fn);
      console.log(`      ${step.padEnd(22)} → ${alive2.length}`);
    }
  }

  // 이슈 공급 관측
  const perIssue = new Map<string, number>();
  for (const r of results) perIssue.set(r.baseKeyword, (perIssue.get(r.baseKeyword) || 0) + 1);
  console.log('🔬 이슈별 후보 배분');
  for (const [k, n] of perIssue) console.log(`   ${String(n).padStart(3)}개  ${k}`);

  console.log('');
  const top = [...results].sort((a, b) => b.nicheScore - a.nicheScore).slice(0, 15);
  console.log('키워드                          | 등급 | 검색량   | 문서수    | 황금비 | 수요7d | 틈새 | 경로     | 원이슈');
  for (const r of top) {
    const kw = r.keyword.padEnd(30).slice(0, 30);
    const ratio = r.goldenRatio === null ? '-' : r.goldenRatio.toFixed(1);
    console.log(
      `${kw} | ${String(r.grade).padEnd(4)} | ${fmt(r.searchVolume).padStart(8)} | ${fmt(r.documentCount).padStart(9)} | ${ratio.padStart(6)} | ${(r.demandRecent7 === null ? '-' : r.demandRecent7.toFixed(1)).padStart(6)} | ${r.isNiche ? ' O  ' : ' .  '} | ${String(r.nicheRoute || '-').padEnd(8)} | ${r.baseKeyword}`,
    );
  }

  console.log('');
  console.log(`판정: ${results.length === 0 ? '❌ never-empty 위반 — 결과 0개' : '✅ 결과 산출됨'}`);
  console.log(`판정: ${niche.length === 0 ? '⚠️ 틈새 0개 — 게이트 재캘리브레이션 필요' : `✅ 틈새 ${niche.length}개`}`);
  process.exit(results.length === 0 ? 2 : 0);
})();
