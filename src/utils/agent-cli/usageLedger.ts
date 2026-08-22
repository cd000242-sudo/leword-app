/**
 * 엔진별 사용 장부 — "얼마나 썼나"를 이 앱이 직접 센다.
 *
 * 왜 필요한가(사장님 지시 2026-08-22):
 *   "클로드코드 외에는 사용량이 안 뜨니까, 현재 구독 플랜으로 몇 회 사용
 *    가능한지 몇 시간 뒤에 초기화되는지도 보여줘야 사용하면서 조절합니다."
 *
 * 실측으로 낼 수 있는 것과 없는 것을 갈라야 한다:
 *   클로드  — 앤트로픽이 응답 헤더로 사용률·초기화 시각을 준다(그건 그대로 쓴다).
 *   코덱스·제미나이·그록 — CLI 에도 인증 파일에도 사용량이 없다(실측 확인:
 *            codex --help 전수 · grok --help 전수 · codex exec --json 메타데이터).
 *            서비스가 공표하는 "몇 회" 한도도 없다(오픈AI 는 동적이라고만 안내한다).
 *
 * 그래서 남은 정직한 숫자는 **이 앱이 몇 번 돌렸는가**다. 한도를 지어내는 대신
 * 쓴 횟수와 창이 언제 새로 시작하는지를 보여 준다 — 조절에 실제로 쓰이는 값이다.
 *
 * 기록은 이 PC 안에만 남는다. 프롬프트도 응답도 저장하지 않는다 — 시각과 성패뿐.
 */
import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { AgentProvider } from './types';

/** 창 하나 = 5시간. 클로드 헤더의 5시간 창과 눈금을 맞춘다. */
export const USAGE_WINDOW_MS = 5 * 60 * 60 * 1000;
/** 하루 창 — 코덱스·제미나이는 일 단위로 조이는 편이라 같이 보여 준다. */
export const USAGE_DAY_MS = 24 * 60 * 60 * 1000;
/** 장부가 무한히 커지지 않게. 하루치를 넘는 기록은 버린다. */
const KEEP_MS = USAGE_DAY_MS;

type Entry = { at: number; provider: AgentProvider; ok: boolean };
type Ledger = { entries: Entry[] };

let cache: Ledger | null = null;
let writing: Promise<void> = Promise.resolve();

function ledgerPath(): string {
  return join(app.getPath('userData'), 'agent-usage.json');
}

async function load(): Promise<Ledger> {
  if (cache) return cache;
  try {
    const raw = await readFile(ledgerPath(), 'utf8');
    const parsed = JSON.parse(raw) as Ledger;
    cache = { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    // 파일이 없으면 첫 회차다 — 빈 장부로 시작한다.
    cache = { entries: [] };
  }
  return cache;
}

/** 오래된 기록을 떨군 사본. 원본을 바꾸지 않는다. */
function pruned(entries: Entry[], now: number): Entry[] {
  return entries.filter((entry) => now - entry.at <= KEEP_MS);
}

/** 한 번 돌린 것을 적는다. 실패도 적는다 — 한도에 부딪힌 것도 사용이다. */
export async function recordAgentRun(provider: AgentProvider, ok: boolean): Promise<void> {
  const now = Date.now();
  const ledger = await load();
  cache = { entries: [...pruned(ledger.entries, now), { at: now, provider, ok }] };
  const snapshot = cache;
  // 쓰기를 줄 세운다 — 동시에 여러 번 돌리면 마지막 것만 남는 사고가 난다.
  writing = writing.then(async () => {
    try {
      await mkdir(dirname(ledgerPath()), { recursive: true });
      await writeFile(ledgerPath(), JSON.stringify(snapshot), 'utf8');
    } catch {
      // 기록에 실패해도 추론은 이미 끝났다 — 화면을 막지 않는다.
    }
  });
  await writing;
}

export interface AgentUsageSummary {
  provider: AgentProvider;
  /** 최근 5시간 안에 돌린 횟수. */
  window5h: number;
  /** 최근 24시간 안에 돌린 횟수. */
  day: number;
  /** 그중 실패(한도·오류) 횟수 — 한도에 부딪히기 시작했는지의 신호다. */
  failed5h: number;
  /**
   * 5시간 창이 새로 시작하는 시각(ISO).
   * 창 안 가장 오래된 기록 + 5시간이다. 기록이 없으면 null —
   * 쓴 적이 없으면 초기화될 것도 없다.
   */
  resetAt: string | null;
  /** 마지막으로 돌린 시각(ISO). 없으면 null. */
  lastAt: string | null;
}

/** 엔진별 사용 요약. 전부 이 앱이 센 값이다 — 서비스가 준 값이 아니다. */
export async function summarizeAgentUsage(): Promise<AgentUsageSummary[]> {
  const now = Date.now();
  const ledger = await load();
  const entries = pruned(ledger.entries, now);
  const providers: AgentProvider[] = ['claude', 'codex', 'gemini', 'grok'];
  return providers.map((provider) => {
    const mine = entries.filter((entry) => entry.provider === provider);
    const inWindow = mine.filter((entry) => now - entry.at <= USAGE_WINDOW_MS);
    const oldest = inWindow.length > 0 ? Math.min(...inWindow.map((entry) => entry.at)) : null;
    const last = mine.length > 0 ? Math.max(...mine.map((entry) => entry.at)) : null;
    return {
      provider,
      window5h: inWindow.length,
      day: mine.length,
      failed5h: inWindow.filter((entry) => !entry.ok).length,
      resetAt: oldest === null ? null : new Date(oldest + USAGE_WINDOW_MS).toISOString(),
      lastAt: last === null ? null : new Date(last).toISOString(),
    };
  });
}
