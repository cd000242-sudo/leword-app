#!/usr/bin/env node
/**
 * 애드센스 고수 벤치마크 출처 목록 만들기(2026-10-07 사장님 엑셀 → 홈판과 같은 상한 786곳).
 *
 * 엑셀 `애드센스_고수블로그_벤치마킹_1.xlsx`의 '전체 목록' 시트(6,440곳)에서 고른다.
 * - 순서: 최근 7일 발행 있음 → 등급(S→A→B→C) → 7일 발행 수 → 애드센스 확인(Y) → 점수
 *   (첫 실행에서 등급만 앞세웠더니 786곳 중 236곳이 7일간 글이 0 — 7일 판에 소재를 못 보탠다)
 * - 분야마다 최소 자리를 먼저 채운다 — 금융(1,500곳)이 상한을 다 먹지 않게.
 * - https RSS 만. 애드센스 pub ID 는 공개 판에 싣지 않는다(엑셀에는 있다).
 *
 * 사용: node scripts/adsense-benchmarks-sources.cjs --xlsx=<엑셀> [--cap=786] [--min=15] [--out=scripts/adsense-benchmarks-sources.json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const GRADE_RANK = { S: 0, A: 1, B: 2, C: 3 };
const DEFAULT_CAP = 786;
const DEFAULT_MIN_PER_CATEGORY = 15;

function platformOf(label) {
  const text = String(label || '');
  if (text.includes('티스토리')) return 'tistory';
  if (text.includes('워드프레스')) return 'wordpress';
  if (text.includes('블로그스팟')) return 'blogspot';
  return 'rss';
}

function httpsUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'https:' && !u.username && !u.password && !u.port ? u : null;
  } catch { return null; }
}

/** 엑셀 한 줄 → 공개 출처. 쓸 수 없는 줄(https RSS 없음)은 null. */
function toSource(row) {
  const feed = httpsUrl(row.RSS);
  const site = httpsUrl(row.URL) || (feed ? new URL(feed.origin) : null);
  if (!feed || !site) return null;
  const host = feed.hostname.toLowerCase();
  return {
    id: host.replace(/^www\./, '').replace(/[^a-z0-9.-]/g, '').replace(/\./g, '-'),
    name: String(row['블로그명'] || host).trim().slice(0, 60),
    url: site.origin + (site.pathname === '/' ? '' : site.pathname.replace(/\/$/, '')),
    feedUrl: feed.href,
    platform: platformOf(row['플랫폼']),
    category: String(row['카테고리'] || '종합·기타').trim(),
    grade: GRADE_RANK[String(row['등급']).trim()] !== undefined ? String(row['등급']).trim() : 'C',
    score: Number(row['점수']) || 0,
    weekPosts: Number(row['7일 발행(RSS)']) || 0,
    adsense: String(row['애드센스']).trim() === 'Y',
  };
}

function compareSources(a, b) {
  return (Number(b.weekPosts > 0) - Number(a.weekPosts > 0))
    || (GRADE_RANK[a.grade] - GRADE_RANK[b.grade])
    || (b.weekPosts - a.weekPosts)
    || (Number(b.adsense) - Number(a.adsense))
    || (b.score - a.score)
    || a.feedUrl.localeCompare(b.feedUrl);
}

/** 상한 cap 까지 고른다. 분야마다 minPerCategory 자리를 먼저 채우고 나머지는 전체 순서대로. */
function selectSources(rows, { cap = DEFAULT_CAP, minPerCategory = DEFAULT_MIN_PER_CATEGORY } = {}) {
  const seen = new Set();
  const all = [];
  for (const row of rows) {
    const source = toSource(row);
    if (!source || seen.has(source.feedUrl)) continue;
    seen.add(source.feedUrl);
    all.push(source);
  }
  all.sort(compareSources);
  const picked = new Set();
  if (minPerCategory > 0) {
    const byCategory = new Map();
    for (const s of all) byCategory.set(s.category, [...(byCategory.get(s.category) || []), s]);
    for (const list of byCategory.values()) for (const s of list.slice(0, minPerCategory)) { if (picked.size < cap) picked.add(s); }
  }
  for (const s of all) { if (picked.size >= cap) break; picked.add(s); }
  return [...picked].sort(compareSources);
}

function main() {
  const arg = (name, fallback = '') => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3) || fallback;
  const xlsxPath = arg('xlsx');
  if (!xlsxPath) { console.error('--xlsx=<애드센스 고수 블로그 엑셀> 이 필요합니다.'); process.exit(2); }
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets['전체 목록'];
  if (!sheet) throw new Error("엑셀에 '전체 목록' 시트가 없습니다.");
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const sources = selectSources(rows, { cap: Number(arg('cap')) || DEFAULT_CAP, minPerCategory: Number(arg('min', String(DEFAULT_MIN_PER_CATEGORY))) });
  const out = path.resolve(arg('out', path.join(__dirname, 'adsense-benchmarks-sources.json')));
  fs.writeFileSync(out, JSON.stringify({ builtAt: new Date().toISOString(), from: path.basename(xlsxPath), total: sources.length, sources }, null, 2) + '\n', 'utf8');
  const tally = (key) => Object.entries(sources.reduce((m, s) => ({ ...m, [s[key]]: (m[s[key]] || 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(' · ');
  console.log(`엑셀 ${rows.length}줄 → 출처 ${sources.length}곳 → ${out}`);
  console.log(`등급: ${tally('grade')}`);
  console.log(`플랫폼: ${tally('platform')}`);
  console.log(`분야: ${tally('category')}`);
}

module.exports = { selectSources, toSource, DEFAULT_CAP };

if (require.main === module) main();
