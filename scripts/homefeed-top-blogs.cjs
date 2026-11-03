/**
 * 홈판 상위 이력 블로그(2026-10-27 사장님 "알고리즘 철저히 분석해서 진행").
 *
 * 25일치 실측(어드바이저 홈판 상위 381편 × 판 원문 28,574편)에서 홈판 상위를 가른 가장 강한 신호는 블로그 이력이었다 —
 * 발행 전에 상위 경험이 없던 블로그 0.09% · 1~2회 0.57% · 3회 이상 2.93%(32배). 상위 글의 절반을 12개 블로그가 냈다.
 * 판 수집(CI)은 사장님 PC 의 어드바이저 기록을 못 보므로, 블로그별 상위 횟수만 뽑아 이 파일로 넘긴다.
 * 남의 공개 글 주소에서 뽑은 블로그 아이디와 날짜뿐이라 개인정보가 없다.
 *
 *   node scripts/homefeed-top-blogs.cjs [--advisor=<advisor-daily 폴더>] [--out=data/homefeed-top-blogs.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const arg = (name, fallback) => { const f = process.argv.find((a) => a.startsWith(`--${name}=`)); return f ? f.slice(name.length + 3) : fallback; };
const blogOf = (url) => (/blog\.naver\.com\/([A-Za-z0-9_-]+)/.exec(String(url || '')) || [])[1]?.toLowerCase() || null;

/** 어드바이저 하루 기록들 → { 블로그: 상위에 처음 잡힌 날 목록(글마다 한 번) } */
function topBlogsFromDailies(dailies) {
  const firstDay = new Map();
  for (const daily of dailies) {
    if (!daily || typeof daily !== 'object') continue;
    const rows = [
      ...(Array.isArray(daily.homefeedTitles) ? daily.homefeedTitles.map((t) => ({ ...t, day: daily.day })) : []),
      ...(Array.isArray(daily.homefeedWeek) ? daily.homefeedWeek : []),
    ];
    for (const r of rows) {
      // 같은 글이 대소문자 · 모바일 주소로 따로 세지지 않게(블로그 아이디는 대소문자를 가리지 않는다).
      const url = String((r && r.url) || '').replace(/^http:\/\//, 'https://').replace(/^https:\/\/m\.blog/, 'https://blog').replace(/[?#].*$/, '').toLowerCase();
      const day = String((r && r.day) || '');
      if (!blogOf(url) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const prev = firstDay.get(url);
      if (!prev || day < prev) firstDay.set(url, day);
    }
  }
  const blogs = {};
  for (const [url, day] of firstDay) { const b = blogOf(url); (blogs[b] = blogs[b] || []).push(day); }
  for (const b of Object.keys(blogs)) blogs[b].sort();
  return blogs;
}

/** 판 수집이 읽는 꼴 — 블로그 → 상위 횟수(지금 이전). 파일이 없거나 깨졌으면 빈 Map(예전 규칙 그대로). */
function readTopBlogs(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const map = new Map();
    for (const [blog, days] of Object.entries((j && j.blogs) || {})) if (Array.isArray(days) && days.length) map.set(String(blog).toLowerCase(), days.length);
    return map;
  } catch { return new Map(); }
}

function main() {
  const dir = arg('advisor', path.join(process.env.APPDATA || '', 'blogger-admin-panel', 'advisor-daily'));
  const out = arg('out', path.join(__dirname, '..', 'data', 'homefeed-top-blogs.json'));
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const dailies = files.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } });
  const blogs = topBlogsFromDailies(dailies);
  const days = Object.values(blogs).flat().sort();
  const payload = { generatedAt: new Date().toISOString(), source: 'creator-advisor homefeed top', window: { from: days[0] || null, to: days.at(-1) || null }, blogCount: Object.keys(blogs).length, postCount: days.length, blogs };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 1) + '\n', 'utf8');
  console.log(`홈판 상위 이력: 블로그 ${payload.blogCount}곳 · 글 ${payload.postCount}편 (${payload.window.from} ~ ${payload.window.to}) → ${out}`);
}

module.exports = { topBlogsFromDailies, readTopBlogs, blogOf };
if (require.main === module) main();
