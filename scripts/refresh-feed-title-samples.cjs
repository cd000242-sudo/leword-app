#!/usr/bin/env node
/**
 * 실제 홈판 제목 표본 갱신(2026-10-01) — 벤치마크 제목 프롬프트의 본보기.
 *
 * 벤치마크 제목은 CI(깃허브)에서 짓는데, 실제 홈판 상위 제목(어드바이저 main-inflow-content-ranks)은 운영자 PC 앱만 잰다.
 * 그래서 이 PC 의 앱 기록(userData/advisor-daily)에서 제목만 모아 저장소에 싣는다 — 주소 · 계정 정보는 싣지 않는다.
 * 홈판 상위는 계정과 무관한 전체 데이터라 누구 기록이든 같다.
 *
 * 사용: node scripts/refresh-feed-title-samples.cjs   (→ src/utils/homefeed/feed-title-samples.ts 를 다시 쓴다)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.env.APPDATA || '', 'blogger-admin-panel', 'advisor-daily');
const OUT = path.join(__dirname, '..', 'src', 'utils', 'homefeed', 'feed-title-samples.ts');
/** 최근 날짜 · 높은 순위부터 이만큼만 — 프롬프트엔 여기서 골라 12개를 싣는다. */
const CAP = 120;

function readRecords() {
  const names = fs.readdirSync(DIR).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n));
  return names.map((n) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8')); } catch { return null; } }).filter(Boolean);
}

function main() {
  const rows = [];
  for (const record of readRecords()) {
    (record.homefeedTitles || []).forEach((row, index) => rows.push({ day: record.day, rank: index + 1, title: row.title }));
    for (const row of record.homefeedWeek || []) rows.push({ day: row.day, rank: row.rank, title: row.title });
  }
  const seen = new Set();
  const titles = rows
    .filter((row) => typeof row.title === 'string' && row.title.trim())
    .sort((a, b) => String(b.day).localeCompare(String(a.day)) || a.rank - b.rank)
    .filter((row) => { const key = row.title.replace(/\s+/g, ''); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, CAP);
  const days = [...new Set(rows.map((row) => row.day))].sort();
  const body = [
    '/**',
    ' * 실제 홈판 유입 상위 제목 표본 — scripts/refresh-feed-title-samples.cjs 가 만든다(손으로 고치지 말 것).',
    ` * 어드바이저 main-inflow-content-ranks 실측 ${days[0]} ~ ${days[days.length - 1]} · 고유 ${titles.length}건. 제목만 싣는다(주소 · 계정 없음).`,
    ' * 벤치마크 제목 프롬프트의 모양 본보기이자 베끼기 검사 대상이다(benchmark-title-engine feedTitleSamples).',
    ' */',
    `export const FEED_TITLE_SAMPLES_RANGE = ${JSON.stringify({ from: days[0], to: days[days.length - 1] })};`,
    'export const FEED_TITLE_SAMPLES: readonly string[] = [',
    ...titles.map((row) => `  ${JSON.stringify(row.title)},`),
    '];',
    '',
  ].join('\n');
  fs.writeFileSync(OUT, body, 'utf8');
  console.log(`홈판 제목 표본 ${titles.length}건 (${days[0]} ~ ${days[days.length - 1]}) → ${path.relative(process.cwd(), OUT)}`);
}

main();
