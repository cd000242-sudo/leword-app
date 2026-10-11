#!/usr/bin/env node
/**
 * 오늘의 추천키워드 날짜별 보관함 — site/spa/public/data/today-picks-archive/YYYY-MM-DD.json + index.json
 *
 * 2026-10-11 사장님 "어제 꺼는 어떻게 보니?" — 판이 매일 새 키워드로 바뀌니(어제 실린 말 금지) 지난 판을 날짜별로 남긴다.
 *   - 사이트 추천키워드 탭의 [어제 · 그제 …] 보기가 읽는다.
 *   - today-picks.js --archive 가 그제 이전 황금을 다시 재는 재료로 쓴다("어제만 피하고 그제 황금은 다시").
 * 회차마다 그날 파일을 덮어쓴다(그날 마지막 회차가 남는다). 7일만 남기고, 이력(history) 같은 큰 칸은 뺀다.
 *
 * 사용: node scripts/today-picks-archive.js --board=<today-picks.json> --dir=<today-picks-archive> [--keep=7]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const KST = 9 * 3600000;
const DAY = 86400000;
const kstDay = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const arg = (name, fallback = '') => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };

/** 보관본 — 판 날짜(KST)와 이력 · 변경 집계를 뺀 판. */
function archiveEntry(board) {
  const { history, changes, measurements, ...rest } = board || {};
  return { day: kstDay(Date.parse(board.builtAt)), board: rest };
}

/** 쓸 날짜 · 지울 날짜 · 목록(최신순). keep 일 = 판 날짜 포함 거꾸로 keep 일. */
function planArchive(board, existingDays, keep = 7) {
  const entry = archiveEntry(board);
  const oldest = kstDay(Date.parse(`${entry.day}T00:00:00+09:00`) - (keep - 1) * DAY);
  const days = [...new Set([...(Array.isArray(existingDays) ? existingDays : []), entry.day])];
  return {
    day: entry.day,
    write: entry.board,
    remove: days.filter((d) => d < oldest).sort(),
    index: { days: days.filter((d) => d >= oldest).sort().reverse() },
  };
}

function main() {
  const boardPath = arg('board');
  const dir = arg('dir');
  const keep = Math.max(1, Number(arg('keep')) || 7);
  if (!boardPath || !dir) { console.error('--board=<today-picks.json> --dir=<today-picks-archive> 이 필요합니다.'); process.exit(2); }
  const board = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
  if (!board || !Array.isArray(board.topics) || !Number.isFinite(Date.parse(board.builtAt))) throw new Error('추천키워드 판을 읽지 못했습니다.');
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).map((f) => (/^(\d{4}-\d{2}-\d{2})\.json$/.exec(f) || [])[1]).filter(Boolean);
  const plan = planArchive(board, existing, keep);
  fs.writeFileSync(path.join(dir, `${plan.day}.json`), JSON.stringify(plan.write), 'utf8');
  for (const day of plan.remove) fs.rmSync(path.join(dir, `${day}.json`), { force: true });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ updatedAt: board.builtAt, days: plan.index.days }), 'utf8');
  console.log(`보관함 — ${plan.day} 저장 · 지움 ${plan.remove.length} · 남은 날 ${plan.index.days.join(', ')}`);
}

module.exports = { archiveEntry, planArchive };

if (require.main === module) main();
