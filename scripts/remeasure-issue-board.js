#!/usr/bin/env node
/**
 * 실검 틈새 발행본의 이월 행 재측정 — 검색량(검색광고 키워드도구)·추세(데이터랩 30일)만.
 *
 * 왜(실사고 2026-09-03): 갓 태어난 이슈 키워드는 첫 회차에 키워드도구가 몰라 검색량이
 * null 이고, 행은 48시간 이월되는 동안 아무도 다시 안 재서 도구가 알게 된 뒤(모바일 50)
 * 에도 화면은 '—' 였다('지예은 남편'). 그래프도 같다 — 데이터랩이 첫날 0점을 주면
 * 카드에 그래프가 영영 없었다.
 *
 * 고르는 규칙·입히는 규칙은 src/utils/issue-board-remeasure.ts(순수 함수, 테스트 대상).
 * 이 파일은 파일 읽고 API 부르고 쓰는 껍데기다. 판정(verdict)은 건드리지 않는다.
 * AI 호출 없음 — 실측 API 두 개뿐이라 회차마다 공짜에 가깝다.
 *
 * 사용:
 *   node scripts/remeasure-issue-board.js --in=<발행본.json> --out=<재측정본.json>
 *   ... --maxVolume=80  검색량 재측정 상한(키워드도구 5개씩 묶음)
 *   ... --maxTrend=80   추세 재측정 상한(데이터랩 1키워드 1호출)
 */
'use strict';

require('ts-node/register/transpile-only');
require('./load-project-env').loadProjectEnv();

const fs = require('fs');
const { EnvironmentManager } = require('../src/utils/environment-manager');
const { getNaverSearchAdKeywordVolume } = require('../src/utils/naver-searchad-api');
const { analyzeKeywordTrend } = require('../src/utils/trend-type-classifier');
const { readSearchAdVolume } = require('../src/utils/searchad-volume-read');
const {
  applyTrend,
  applyVolume,
  keyReads,
  pickTrendTargets,
  pickVolumeTargets,
} = require('../src/utils/issue-board-remeasure');

function arg(name, fallback = '') {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function buildSearchAdConfig() {
  const env = EnvironmentManager.getInstance().getConfig();
  const accessLicense = env.naverSearchAdAccessLicense || '';
  const secretKey = env.naverSearchAdSecretKey || '';
  if (!accessLicense || !secretKey) return null;
  const customerId = (env.naverSearchAdCustomerId || '').trim()
    || accessLicense.split(':')[0] || accessLicense.substring(0, 10);
  return { accessLicense, secretKey, customerId };
}

function buildOpenApiConfig() {
  const env = EnvironmentManager.getInstance().getConfig();
  const clientId = env.naverClientId || process.env.NAVER_CLIENT_ID || '';
  const clientSecret = env.naverClientSecret || process.env.NAVER_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** 키워드도구는 5개씩. 캐시를 건너뛴다(forceFresh) — 이월 행은 바로 그 낡은 값을 고치러 온 것이다. */
async function measureVolumes(searchAd, keywords) {
  const entries = [];
  for (let i = 0; i < keywords.length; i += 5) {
    const chunk = keywords.slice(i, i + 5);
    try {
      const rows = await getNaverSearchAdKeywordVolume(searchAd, chunk, { forceFresh: true });
      for (const row of rows) entries.push({ keyword: String(row.keyword), read: readSearchAdVolume(row) });
    } catch (error) {
      console.log(`  !! 검색량 재측정 실패(묶음 건너뜀): ${chunk.join(', ')} — ${String((error && error.message) || error).slice(0, 80)}`);
    }
  }
  return entries;
}

async function measureTrends(openApi, keywords) {
  const entries = [];
  for (const keyword of keywords) {
    try {
      const trend = await analyzeKeywordTrend(keyword, openApi);
      entries.push({
        keyword,
        read: {
          series: Array.isArray(trend.series) ? trend.series : [],
          label: (trend.analysis && trend.analysis.label) || '',
          recommendation: (trend.analysis && trend.analysis.recommendation) || '',
        },
      });
    } catch (error) {
      console.log(`  !! [${keyword}] 추세 재측정 실패(그대로 둠): ${String((error && error.message) || error).slice(0, 60)}`);
    }
  }
  return entries;
}

async function main() {
  const inPath = arg('in');
  const outPath = arg('out');
  const maxVolume = Number(arg('maxVolume')) || 80;
  const maxTrend = Number(arg('maxTrend')) || 80;
  if (!inPath || !outPath) {
    console.error('--in=<발행본.json> --out=<재측정본.json> 이 필요합니다.');
    process.exit(2);
  }
  const board = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const rows = Array.isArray(board.rows) ? board.rows : [];
  const nowMs = Date.now();
  const measuredAt = new Date(nowMs).toISOString();

  const searchAd = buildSearchAdConfig();
  const openApi = buildOpenApiConfig();
  const volumeTargets = searchAd ? pickVolumeTargets(rows, nowMs).slice(0, maxVolume) : [];
  const trendTargets = openApi ? pickTrendTargets(rows, nowMs).slice(0, maxTrend) : [];
  console.log(`발행본 ${rows.length}행 · 검색량 재측정 ${volumeTargets.length}(검색광고 ${searchAd ? 'OK' : '없음'}) · 추세 재측정 ${trendTargets.length}(오픈API ${openApi ? 'OK' : '없음'})`);

  const volumeReads = volumeTargets.length ? await measureVolumes(searchAd, volumeTargets) : [];
  const trendReads = trendTargets.length ? await measureTrends(openApi, trendTargets) : [];

  const withVolume = applyVolume(rows, keyReads(volumeReads), measuredAt);
  const withTrend = applyTrend(withVolume, keyReads(trendReads), measuredAt);

  const volumeFilled = withTrend.filter((row, i) => typeof row.searchVolume === 'number' && typeof rows[i].searchVolume !== 'number');
  const lt10Marked = withTrend.filter((row, i) => row.searchVolumeLt10 === true && rows[i].searchVolumeLt10 !== true);
  const trendFilled = withTrend.filter((row, i) => row.trend && row.trend.series && row.trend.series.length >= 2
    && !(rows[i].trend && rows[i].trend.series && rows[i].trend.series.length >= 2));
  for (const row of volumeFilled) console.log(`  + [${row.keyword}] 검색량 ${row.searchVolume}${row.searchVolumeLt10 ? ' (한쪽 <10)' : ''}`);
  for (const row of lt10Marked.filter((r) => typeof r.searchVolume !== 'number')) console.log(`  · [${row.keyword}] 검색량 10 미만`);
  for (const row of trendFilled) console.log(`  ~ [${row.keyword}] 추세 ${row.trend.series.length}점 ${row.trend.label || ''}`);

  fs.writeFileSync(outPath, JSON.stringify({ ...board, rows: withTrend }, null, 2) + '\n');
  console.log(`재측정본 ${outPath} — 검색량 채움 ${volumeFilled.length} · 10미만 표식 ${lt10Marked.length} · 그래프 생김 ${trendFilled.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
