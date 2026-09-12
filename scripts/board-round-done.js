#!/usr/bin/env node
/**
 * 이 회차가 이미 실렸나 — 예약을 여러 틱으로 걸어 둔 보드의 문지기.
 *
 * 왜 필요한가(실측 2026-09-12). 선점 보드(황금키워드)는 8월 14일부터 월·금 예약으로
 * 꼬박꼬박 돌았는데 **09-11 금요일 딱 한 틱이 빠졌다**. 사장님이 "11일자로 또 안돌았고"
 * 라고 하신 그 회차다. 깃허브가 예약을 늦추거나 아예 떨어뜨리는 것은 이 레포에
 * 이미 기록된 버릇이다(09-09 예약은 4.4시간 늦게 돌았고 두 틱은 실행 기록조차 없다).
 *
 * 고치는 법은 오늘의 글감에 이미 쓰고 있는 것과 같다 — **한 회차를 세 번 예약하고,
 * 먼저 도는 하나만 일한다.** 그런데 선점 보드는 한 회차가 4시간에 BD 예산까지 쓰는
 * 일이라, 문지기 없이 틱만 늘리면 비용이 세 배가 된다. 그래서 비용 드는 단계 앞에
 * 이 문지기를 세운다.
 *
 * 판정은 **회차 단위**다. "오늘 돌았나"가 아니다 — 실검 틈새처럼 하루 세 번 도는
 * 보드는 날짜로 세면 두 번째·세 번째 회차가 통째로 막힌다. 지금 시각에서 가장 가까운
 * 지난 예정 시각을 찾아, 발행본이 그 뒤에 실렸으면 이번 회차는 이미 끝난 것이다.
 *
 * 못 읽었을 때는 **건너뛰지 않는다**. 발행본을 못 읽었다는 사실은 "이미 돌았다"는
 * 근거가 아니다. 안 돌면 사장님 보드가 비고, 한 번 더 돌면 돈만 든다. 빈 보드가 더 나쁘다.
 *
 *   node scripts/board-round-done.js \
 *     --url=https://leaderspro.kr/data/preemption-board.json --field=publishedAt --rounds=06:23
 *   → 표준출력에 done=true|false, GITHUB_OUTPUT 이 있으면 거기에도 쓴다.
 */
const fs = require('fs');

const DAY_MS = 24 * 3600000;
const KST_MS = 9 * 3600000;

/** 한국 날짜(YYYY-MM-DD). UTC 에 9시간을 더한 뒤 날짜 자리만 본다. */
function kstDay(msOrIso) {
  const ms = typeof msOrIso === 'number' ? msOrIso : Date.parse(msOrIso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + KST_MS).toISOString().slice(0, 10);
}

/** '06:23' → {hour:6, minute:23}. 못 읽으면 null. */
function parseRound(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * 지금 기준으로 **가장 가까운 지난 회차 예정 시각**(UTC ms).
 *
 * 오늘 회차가 아직 하나도 안 왔으면 어제 마지막 회차를 돌려준다 — 한국 새벽 2시에
 * 깨어난 틱이 "오늘 06:23 회차"를 기다리며 어제 저녁 회차를 놓치지 않게.
 */
function lastScheduledBefore(rounds, nowMs) {
  const valid = rounds.map(parseRound).filter(Boolean).sort((a, b) => (a.hour - b.hour) || (a.minute - b.minute));
  if (!valid.length) return null;
  const kstNow = new Date(nowMs + KST_MS);
  const midnightKstUtc = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - KST_MS;
  const times = valid.map((r) => midnightKstUtc + (r.hour * 60 + r.minute) * 60000);
  const past = times.filter((t) => t <= nowMs);
  if (past.length) return past[past.length - 1];
  // 오늘 회차가 아직 안 왔다 — 어제 마지막 회차가 기준이다.
  return times[times.length - 1] - DAY_MS;
}

/**
 * 이 회차가 이미 실렸나.
 *
 * @param publishedAt 발행본이 말하는 시각(ISO). 없거나 못 읽었으면 null 을 넘긴다.
 * @param rounds 하루 예정 시각들(한국 시각 'HH:MM').
 * @param nowMs 지금.
 * @returns true 면 건너뛴다. 판단할 근거가 없으면 false — 도는 쪽을 고른다.
 */
function roundAlreadyDone(publishedAt, rounds, nowMs) {
  if (!publishedAt) return false;
  const at = Date.parse(publishedAt);
  if (!Number.isFinite(at)) return false;
  const due = lastScheduledBefore(rounds, nowMs);
  if (due === null) return false;
  return at >= due;
}

async function readPublishedAt(url, field, fetchImpl) {
  try {
    const res = await fetchImpl(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return { value: null, note: `HTTP ${res.status}` };
    const data = await res.json();
    const value = data && typeof data[field] === 'string' ? data[field] : null;
    return { value, note: value ? '읽음' : `${field} 가 없다` };
  } catch (error) {
    return { value: null, note: String((error && error.message) || error).slice(0, 120) };
  }
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const url = arg('url');
  const field = arg('field', 'publishedAt');
  const rounds = String(arg('rounds', '06:23')).split(',').map((x) => x.trim()).filter(Boolean);
  if (!url) {
    console.error('--url 이 필요하다');
    process.exit(2);
  }
  const { value, note } = await readPublishedAt(url, field, fetch);
  const now = Date.now();
  const due = lastScheduledBefore(rounds, now);
  const done = roundAlreadyDone(value, rounds, now);
  const ko = (ms) => (ms === null ? '(없음)' : new Date(ms + KST_MS).toISOString().replace('T', ' ').slice(0, 16));
  console.log(`이번 회차 예정(한국): ${ko(due)}`);
  console.log(`발행본 ${field}: ${value ? ko(Date.parse(value)) : '(없음)'} (${note})`);
  console.log(done ? '→ 이번 회차는 이미 실렸다. 이 틱은 건너뛴다.' : '→ 이번 회차가 아직 비었다. 이 틱이 일한다.');
  console.log(`done=${done}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `done=${done}\n`);
  }
  process.exit(0);
}

module.exports = { kstDay, parseRound, lastScheduledBefore, roundAlreadyDone, readPublishedAt };

if (require.main === module) {
  main().catch((error) => {
    // 문지기가 죽어도 회차는 살린다 — 판단 못 했으면 도는 쪽이다.
    console.error('문지기 실패 — 그냥 돈다:', String((error && error.message) || error).slice(0, 160));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'done=false\n');
    process.exit(0);
  });
}
