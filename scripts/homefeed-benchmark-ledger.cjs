'use strict';
/**
 * 홈판 벤치마크 시간 장부(2026-10-01) — 매시 관측을 덮어쓰지 않고 쌓는다.
 * 상태 파일(homefeed-benchmark-state.json)은 글마다 마지막 값 하나만 남겨, 선행 채널 지수(이 채널이 쓴 소재가
 * 몇 시간 뒤 홈판에 뜨나)와 공감 속도 기준선을 셀 재료가 없었다.
 *
 * 하루 한 파일(KST 날짜, JSON Lines). 새로 본 글은 'seen' 한 줄, 반응 수가 바뀐 글만 'm' 한 줄 — 같은 값은 다시 안 적는다.
 * 앞 회차에 한 출처가 실패했다 돌아오면 같은 글의 seen 이 또 적힐 수 있다 — 읽는 쪽은 주소별 가장 이른 t 를 쓴다.
 * 첫 회차(장부 없음)의 seen 은 b:1 — 그 전부터 떠 있던 글이라 처음 본 시각을 모른다. 선행 시간 계산에서 뺀다.
 * 공개 제목 · 주소 · 수치만 적는다(RSS 본문 · 세션 정보 없음). 14일 지난 파일은 지운다.
 */
const fs = require('fs');
const path = require('path');

const KST_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const RETAIN_DAYS = 14;
const METRIC_KEYS = ['views', 'likes', 'comments'];
const LEDGER_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

const kstDay = (iso) => new Date(Date.parse(iso) + KST_MS).toISOString().slice(0, 10);
const finiteMetrics = (metrics) => Object.fromEntries(METRIC_KEYS.filter((k) => Number.isFinite(metrics?.[k])).map((k) => [k, metrics[k]]));

/** 이번 값 중 하나라도 앞 관측과 다르면 이번 값 전부(유한한 것만), 아니면 null. */
function changedMetrics(current, previous) {
  const now = finiteMetrics(current);
  const before = finiteMetrics(previous);
  return Object.keys(now).some((k) => now[k] !== before[k]) ? now : null;
}

/** 이번 회차 게시물 × 앞 회차 관측 → 장부에 더할 줄들. 입력은 건드리지 않는다. */
function ledgerRows(posts, previousObservations, now, { bootstrap = false } = {}) {
  const prevByUrl = bootstrap ? new Map() : new Map((previousObservations || []).map((o) => [o.url, o]));
  const seen = new Set();
  const rows = [];
  for (const p of posts || []) {
    if (!p?.url || seen.has(p.url)) continue;
    seen.add(p.url);
    const prev = prevByUrl.get(p.url);
    if (!prev) rows.push({ k: 'seen', t: now, u: p.url, s: p.sourceId, pf: p.platform, p: p.publishedAt || null, ti: p.title || '', ...(bootstrap ? { b: 1 } : {}) });
    const m = changedMetrics(p.metrics, prev?.metrics);
    if (m) rows.push({ k: 'm', t: now, u: p.url, v: m });
  }
  return rows;
}

/** 장부 폴더에 날짜 파일이 하나도 없으면 첫 회차다. */
function isEmptyLedger(dir) {
  return !fs.existsSync(dir) || !fs.readdirSync(dir).some((f) => LEDGER_FILE.test(f));
}

/** 오늘(KST) 파일에 이어 적고, 보존 기간이 지난 날짜 파일을 지운다. */
function appendLedger(dir, rows, now, retainDays = RETAIN_DAYS) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${kstDay(now)}.jsonl`);
  if (rows.length) {
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const temp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temp, before + rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
      fs.renameSync(temp, file);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  const cutoff = kstDay(new Date(Date.parse(now) - retainDays * DAY_MS).toISOString());
  const removed = fs.readdirSync(dir).filter((f) => LEDGER_FILE.test(f) && f.slice(0, 10) < cutoff).sort();
  for (const f of removed) fs.unlinkSync(path.join(dir, f));
  return { file, appended: rows.length, removed };
}

module.exports = { ledgerRows, appendLedger, isEmptyLedger, kstDay };
