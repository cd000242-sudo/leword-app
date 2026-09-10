/**
 * 회차 감시견 — 깃허브 예약이 빠지면 앱이 대신 깨운다.
 *
 * 사장님 2026-09-10: "오늘의 글감 시간 지났는데 또 안 됐어".
 *
 * 왜 필요한가(실측) — 깃허브 예약이 늦거나 **아예 안 뜬다**.
 *   09-09 09:23 예약 → 13:47 실행(4.4시간 늦음)
 *   09-09 21:23 · 09-10 03:23 → 실행 기록 없음
 *   회차마다 예약을 3틱(06:23·07:23·08:23 KST 꼴)으로 늘렸는데도 오후 슬롯 3틱이 **전부** 빠졌다.
 * 틱을 더 늘려도 같은 스케줄러라 나아지지 않는다.
 *
 * 대신 이 PC 를 쓴다. 사장님 PC 는 잠깐 쉬는 30분 말고는 늘 켜져 있다("강제로 꺼지지 않는 이상").
 * 발행된 파일을 20분마다 열어 보고, 지금 회차가 비어 있고 예정 시각이 40분 넘게 지났으면
 * 워크플로를 깨운다. 깨우는 것은 이 PC 에 이미 로그인된 gh CLI 로 한다 — 토큰을 앱에 새로 저장하지 않는다.
 *
 * 안전장치
 *   · 한 회차당 하루 한 번만 깨운다(장부를 파일로 남긴다). 실패해도 회차가 두 번 돌지 않는다.
 *   · 워크플로 자체가 --skipIfSlotDone 을 들고 있어, 이미 실렸으면 깨워도 곧장 나간다(헛돈 0).
 *   · 40분을 기다리는 이유: 예약이 조금 늦는 것은 정상이다. 그것까지 깨우면 두 번 돈다.
 */
import { app } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** 회차 이름 경계 — topic-briefs.ts 의 roundSlotOf 와 같은 규칙(11시·17시). */
type Slot = '아침' | '오후' | '저녁';

const PUBLISHED = 'https://leaderspro.kr/data/topic-briefs.json';
const REPO = 'cd000242-sudo/leword-app';
const WORKFLOW = 'topic-briefs.yml';
/** 예정 시각이 이만큼 지나도 회차가 비어 있으면 깨운다. 예약이 조금 늦는 것은 정상이라 넉넉히 둔다. */
const GRACE_MS = 40 * 60_000;
const EVERY_MS = 20 * 60_000;

const LEDGER = () => path.join(app.getPath('userData'), 'ci-watchdog.json');

/** 한국 시각 기준 지금 회차와 그 회차의 예정 시각(KST). */
export function slotNow(nowMs: number): { slot: Slot; day: string; startedAtMs: number } {
  const kst = new Date(nowMs + 9 * 3_600_000);
  const hour = kst.getUTCHours();
  const slot: Slot = hour < 11 ? '아침' : hour < 17 ? '오후' : '저녁';
  const startHour = slot === '아침' ? 6 : slot === '오후' ? 12 : 18;
  const start = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), startHour, 23));
  return {
    slot,
    day: kst.toISOString().slice(0, 10),
    startedAtMs: start.getTime() - 9 * 3_600_000,
  };
}

function readLedger(): Record<string, string> {
  try { return JSON.parse(fs.readFileSync(LEDGER(), 'utf8')); } catch { return {}; }
}

function writeLedger(value: Record<string, string>): void {
  try { fs.writeFileSync(LEDGER(), JSON.stringify(value, null, 1), 'utf8'); } catch { /* 못 남겨도 회차는 산다 */ }
}

/** 발행본에 이 회차가 실려 있나. 못 읽으면 null — '없다'와 구분한다(못 읽었다고 깨우면 안 된다). */
export async function publishedSlots(fetchImpl: typeof fetch = fetch): Promise<Set<string> | null> {
  try {
    const res = await fetchImpl(`${PUBLISHED}?t=${Date.now()}`, { cache: 'no-store' } as any);
    if (!res.ok) return null;
    const data: any = await res.json();
    const rounds: any[] = Array.isArray(data?.rounds) ? data.rounds : [];
    return new Set(rounds
      .filter((round) => round?.builtAt && new Date(new Date(round.builtAt).getTime() + 9 * 3_600_000).toISOString().slice(0, 10)
        === new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10))
      .map((round) => String(round.slot)));
  } catch {
    return null;
  }
}

function dispatch(): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    execFile('gh', ['workflow', 'run', WORKFLOW, '--repo', REPO, '--ref', 'main'], { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) resolve({ ok: false, detail: String(stderr || error.message).slice(0, 200) });
      else resolve({ ok: true, detail: String(stdout || '').trim().slice(0, 200) });
    });
  });
}

/** 한 번 살펴본다. 깨웠으면 true. */
export async function checkOnce(nowMs: number = Date.now()): Promise<{ acted: boolean; reason: string }> {
  const { slot, day, startedAtMs } = slotNow(nowMs);
  if (nowMs - startedAtMs < GRACE_MS) return { acted: false, reason: `${slot} 회차 예정 시각이 아직 안 지났다` };

  const ledger = readLedger();
  const key = `${day}-${slot}`;
  if (ledger[key]) return { acted: false, reason: `${slot} 회차는 이미 깨웠다(${ledger[key]})` };

  const slots = await publishedSlots();
  if (slots === null) return { acted: false, reason: '발행본을 못 읽었다 — 이번엔 넘어간다' };
  if (slots.has(slot)) return { acted: false, reason: `${slot} 회차는 이미 실려 있다` };

  const result = await dispatch();
  if (result.ok) {
    writeLedger({ ...ledger, [key]: new Date(nowMs).toISOString() });
    console.log(`[CI-WATCHDOG] ${slot} 회차가 비어 있어 워크플로를 깨웠다.`);
    return { acted: true, reason: `${slot} 회차를 깨웠다` };
  }
  console.warn(`[CI-WATCHDOG] 깨우기 실패 — ${result.detail}`);
  return { acted: false, reason: `깨우기 실패: ${result.detail}` };
}

let timer: NodeJS.Timeout | null = null;

export function startCiWatchdog(): void {
  if (timer) return;
  // 앱이 막 켜졌을 때 한 번, 그다음부터 20분마다. 켜자마자 도는 것은 "밤새 빠진 회차"를 잡기 위함이다.
  setTimeout(() => { void checkOnce().catch(() => { /* 조용히 — 다음 차례에 다시 */ }); }, 60_000);
  timer = setInterval(() => { void checkOnce().catch(() => { /* 조용히 */ }); }, EVERY_MS);
  console.log('[CI-WATCHDOG] ✅ 회차 감시견 시작 — 20분마다 발행본을 보고 빠진 회차를 깨운다');
}

export function stopCiWatchdog(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
