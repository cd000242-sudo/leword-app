#!/usr/bin/env node
/**
 * 황금키워드 보드 → 정적 스냅샷 발행 (M0 스냅샷 브리지)
 *
 * 왜 필요한가:
 *   지금 보드는 24시간 워커가 메모리에 들고 있다가 API(/v1/public/live-golden)로만 서빙된다.
 *   그래서 서버를 끄는 순간 보드가 깜깜해진다. 서버($52)를 폐지하고 주중 2회 배치로 가려면,
 *   "보드를 정적 JSON 으로 발행하고 앱이 그걸 읽는" 경로가 먼저 있어야 한다.
 *
 * 이 스크립트는 그 다리다:
 *   워커가 쓴 보드 파일(live-golden-board.json) → 클라이언트 계약 형태로 변환 → SPA 공개 폴더에 발행.
 *   나중에 Bright Data 배치가 같은 출력 파일을 쓰면, 클라이언트는 아무 변경 없이 그대로 읽는다.
 *
 * 클라이언트 계약(leword-pro-web.html: normalizeProGoldenSnapshot):
 *   { board | items | keywords: [...] } 를 받아들이며, proSnapshot/snapshot 래핑도 허용한다.
 *   여기서는 board + items 를 함께 넣어 구버전/신버전 어느 쪽이든 읽히게 한다.
 *
 * 사용:
 *   node scripts/publish-golden-snapshot.js
 *   node scripts/publish-golden-snapshot.js --in <보드파일> --out <출력파일> [--max 240]
 *
 * 안전 규칙:
 *   - 입력이 비었거나 항목 0개면 기존 스냅샷을 덮어쓰지 않는다(좋은 데이터를 빈 데이터로 죽이지 않음).
 *   - 원자적 교체(tmp → rename)로 반쯤 쓰인 파일이 서빙되지 않게 한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_IN = process.env['LEWORD_MOBILE_LIVE_GOLDEN_BOARD_FILE'] || '';
const DEFAULT_OUT = path.resolve(
  __dirname,
  '..',
  'tmp',
  'leaderspro-admin-work',
  'spa',
  'public',
  'data',
  'live-golden-board.json',
);
const DEFAULT_MAX = 240;

function parseArgs(argv) {
  const out = { in: DEFAULT_IN, out: DEFAULT_OUT, max: DEFAULT_MAX };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i] || out.in;
    else if (a === '--out') out.out = argv[++i] || out.out;
    else if (a === '--max') out.max = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_MAX);
  }
  return out;
}

/** 보드 파일에서 항목 배열을 꺼낸다. 워커는 items, 일부 경로는 board/keywords 를 쓴다. */
function extractItems(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const candidates = [raw.items, raw.board, raw.keywords, raw.snapshot && raw.snapshot.board];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) return c;
  }
  return [];
}

/** 표시에 필요한 필드만 남긴다 — 내부 전용 필드를 공개 스냅샷에 흘리지 않는다. */
function sanitizeItem(item) {
  if (!item || typeof item !== 'object') return null;
  const keyword = String(item.keyword || '').trim();
  if (!keyword) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    keyword,
    grade: item.grade || null,
    score: num(item.score),
    pcSearchVolume: num(item.pcSearchVolume),
    mobileSearchVolume: num(item.mobileSearchVolume),
    totalSearchVolume: num(item.totalSearchVolume),
    documentCount: num(item.documentCount),
    goldenRatio: num(item.goldenRatio),
    cpc: num(item.cpc),
    category: item.category || null,
    source: item.source || null,
    intent: item.intent || null,
    isMeasured: item.isMeasured === true,
    rank: num(item.rank),
    lane: item.lane || null,
    updatedAt: item.updatedAt || null,
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.in) {
    console.error('[publish-golden-snapshot] 입력 보드 파일을 지정하세요: --in <경로>');
    console.error('  (또는 LEWORD_MOBILE_LIVE_GOLDEN_BOARD_FILE 환경변수)');
    process.exit(2);
  }
  if (!fs.existsSync(args.in)) {
    console.error(`[publish-golden-snapshot] 보드 파일이 없습니다: ${args.in}`);
    process.exit(2);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(args.in, 'utf8'));
  } catch (err) {
    console.error(`[publish-golden-snapshot] 보드 파일 파싱 실패: ${err.message}`);
    process.exit(2);
  }

  const items = extractItems(raw).map(sanitizeItem).filter(Boolean).slice(0, args.max);

  // 빈 결과로 기존 스냅샷을 덮지 않는다. 좋은 데이터를 빈 데이터로 죽이는 것이 최악이다.
  if (!items.length) {
    console.error('[publish-golden-snapshot] 항목 0개 — 기존 스냅샷을 유지하고 종료합니다.');
    process.exit(1);
  }

  const payload = {
    schema: 'live-golden-static-v1',
    updatedAt: raw.boardUpdatedAt || raw.savedAt || new Date().toISOString(),
    generatedAt: new Date().toISOString(),
    source: 'worker-bridge',
    boardCount: items.length,
    boardTarget: Math.max(items.length, args.max),
    // 계약 호환: 클라이언트가 board / items 어느 쪽을 읽어도 동작하게 둘 다 제공.
    board: items,
    items,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  const tmp = `${args.out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
  fs.renameSync(tmp, args.out); // 원자적 교체

  const sizeKb = (fs.statSync(args.out).size / 1024).toFixed(1);
  console.log(`[publish-golden-snapshot] ✅ ${items.length}개 발행 → ${args.out} (${sizeKb}KB)`);
  console.log(`[publish-golden-snapshot]    기준시각: ${payload.updatedAt}`);
}

main();
