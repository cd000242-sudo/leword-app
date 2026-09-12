import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { BOARDS, dueRound, kstDay, roundFilled, lastBuiltAtOf, type WatchedBoard } from '../../main/handlers/ci-watchdog';

/**
 * 회차 감시견 — 여기가 틀리면 멀쩡한 회차를 또 깨우거나(선점 보드는 4시간 + BD 예산),
 * 빠진 회차를 영영 안 깨운다.
 *
 * 사장님 2026-09-12: "사이트 11일자로 황금키워드 또 안돌았고 나머지도 어제또는 10일날 돌린게 최신이야
 * 왜자꾸 안도는거야...??"
 * 그때까지 감시견은 **오늘의 글감 하나만** 보고 있었다. 나머지 셋은 빠져도 아무도 안 깨웠다.
 */
const kst = (month: number, day: number, hour: number, minute = 0) =>
  Date.UTC(2026, month - 1, day, hour, minute) - 9 * 3_600_000;

const boardOf = (name: string): WatchedBoard => {
  const hit = BOARDS.find((b) => b.name.includes(name));
  if (!hit) throw new Error(`감시 대상에 없다: ${name}`);
  return hit;
};

describe('보드 넷을 전부 본다', () => {
  it('사장님이 지적한 보드가 전부 감시 대상이다', () => {
    const names = BOARDS.map((b) => b.name).join(' ');
    for (const must of ['오늘의 글감', '황금키워드', '추천키워드', '실검 틈새']) {
      expect(names, `감시 대상에서 빠졌다: ${must}`).toContain(must);
    }
  });

  it('보드마다 발행본 주소와 깨울 워크플로가 있다', () => {
    for (const b of BOARDS) {
      expect(b.url).toMatch(/^https:\/\/leaderspro\.kr\/data\/.+\.json$/);
      expect(b.workflow).toMatch(/\.yml$/);
      expect(b.rounds.length).toBeGreaterThan(0);
    }
  });
});

describe('회차 시각이 크론과 같다 — 어긋나면 헛돌거나 영영 안 깨운다', () => {
  const workflowDir = path.join(__dirname, '..', '..', '..', '.github', 'workflows');

  /** 워크플로의 크론(UTC)을 한국 시각 'H:M' 집합으로 바꾼다. */
  function kstRoundsOf(file: string): Set<string> {
    const text = fs.readFileSync(path.join(workflowDir, file), 'utf8');
    const out = new Set<string>();
    for (const m of text.matchAll(/^\s*- cron: '(\S+) (\S+) [^']*'/gm)) {
      const minute = Number(m[1]);
      for (const h of m[2].split(',')) {
        // UTC → KST. 자정을 넘기면 날짜만 넘어가고 시각은 나머지로 돈다.
        out.add(`${(Number(h) + 9) % 24}:${minute}`);
      }
    }
    return out;
  }

  it('감시견이 아는 회차 시각이 워크플로 크론 안에 있다', () => {
    for (const b of BOARDS) {
      const cron = kstRoundsOf(b.workflow);
      for (const r of b.rounds) {
        expect([...cron], `${b.name} 의 ${r.hour}:${r.minute} 회차가 ${b.workflow} 크론에 없다`)
          .toContain(`${r.hour}:${r.minute}`);
      }
    }
  });

  it('깨울 때 문지기를 존중한다 — 워크플로가 respectDone 을 받는다', () => {
    for (const b of BOARDS) {
      const text = fs.readFileSync(path.join(workflowDir, b.workflow), 'utf8');
      expect(text, `${b.workflow} 에 respectDone 입력이 없다 — 감시견이 깨우면 헛돈다`).toContain('respectDone:');
    }
  });
});

describe('지금 어느 회차인가', () => {
  it('하루 세 번 도는 보드는 지난 회차를 가리킨다', () => {
    const briefs = boardOf('오늘의 글감');
    expect(dueRound(briefs, kst(9, 12, 9, 0))?.label).toBe('아침');
    expect(dueRound(briefs, kst(9, 12, 14, 0))?.label).toBe('오후');
    expect(dueRound(briefs, kst(9, 12, 20, 0))?.label).toBe('저녁');
  });

  it('회차 예정 시각은 06:23 · 12:23 · 18:23 KST — 크론과 같은 분이다', () => {
    const briefs = boardOf('오늘의 글감');
    const morning = dueRound(briefs, kst(9, 12, 9, 0))!;
    expect(new Date(morning.dueAtMs + 9 * 3_600_000).toISOString()).toBe('2026-09-12T06:23:00.000Z');
  });

  it('한국 새벽에는 어제 저녁 회차를 본다 — 오늘 아침을 기다리다 어제를 놓치지 않게', () => {
    const briefs = boardOf('오늘의 글감');
    const due = dueRound(briefs, kst(9, 12, 2, 0))!;
    expect(due.label).toBe('저녁');
    expect(due.day).toBe('2026-09-11');
  });

  it('날짜는 한국 날짜다 — 자정 직후 UTC 로 세면 전날이 되어 하루 종일 안 깨운다', () => {
    expect(kstDay(kst(9, 12, 0, 30))).toBe('2026-09-12');
    expect(kstDay(kst(9, 12, 23, 30))).toBe('2026-09-12');
  });
});

describe('주 2회 보드는 그 요일만 센다', () => {
  const golden = boardOf('황금키워드');

  it('토요일에는 직전 금요일 회차를 본다 — 사장님이 보신 그 상태', () => {
    // 2026-09-12 는 토요일. 직전 회차는 09-11 금요일 06:23.
    const due = dueRound(golden, kst(9, 12, 8, 12))!;
    expect(due.day).toBe('2026-09-11');
    expect(new Date(due.dueAtMs + 9 * 3_600_000).toISOString()).toBe('2026-09-11T06:23:00.000Z');
  });

  it('금요일 회차가 09-09 발행본으로는 안 채워진다 — 그래서 깨워야 한다', () => {
    const due = dueRound(golden, kst(9, 12, 8, 12))!;
    // 실제 값: preemption-board.json publishedAt = 2026-09-09T01:24:19Z
    expect(roundFilled(Date.parse('2026-09-09T01:24:19.386Z'), due.dueAtMs)).toBe(false);
  });

  it('금요일 아침에 실렸으면 토요일에는 안 깨운다', () => {
    const due = dueRound(golden, kst(9, 12, 8, 12))!;
    expect(roundFilled(kst(9, 11, 10, 24), due.dueAtMs)).toBe(true);
  });

  it('화요일·수요일에는 직전 월요일 회차를 본다 — 없는 요일을 만들지 않는다', () => {
    const due = dueRound(golden, kst(9, 9, 15, 0))!; // 2026-09-09 수요일
    expect(due.day).toBe('2026-09-07'); // 월요일
  });
});

describe('모르는 것을 비었다고 하지 않는다', () => {
  it('발행본을 못 읽으면 null — 깨우지 않는다', async () => {
    const dead = (async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch;
    expect(await lastBuiltAtOf(boardOf('황금키워드'), dead)).toBe(null);
    expect(roundFilled(null, kst(9, 12, 6, 23))).toBe(null);
  });

  it('404 도 마찬가지다', async () => {
    const notFound = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    expect(await lastBuiltAtOf(boardOf('실검 틈새'), notFound)).toBe(null);
  });

  it('시각 필드가 없으면 null 이다', async () => {
    const empty = (async () => ({ ok: true, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await lastBuiltAtOf(boardOf('오늘의 추천키워드'), empty)).toBe(null);
  });
});

describe('회차 목록을 가진 보드는 마지막 회차 시각으로 본다', () => {
  const briefs = boardOf('오늘의 글감');

  it('회차 이름이 아니라 시각으로 판단한다 — 늦게 돈 저녁이 아침으로 적히던 사고가 있었다', async () => {
    const payload = {
      rounds: [
        { slot: '아침', builtAt: new Date(kst(9, 12, 7, 50)).toISOString() },
        // 이름이 '아침'으로 잘못 적혀 있어도 시각이 저녁이면 저녁 회차가 채워진 것이다
        { slot: '아침', builtAt: new Date(kst(9, 12, 19, 10)).toISOString() },
      ],
    };
    const ok = (async () => ({ ok: true, json: async () => payload })) as unknown as typeof fetch;
    const last = await lastBuiltAtOf(briefs, ok);
    const evening = dueRound(briefs, kst(9, 12, 20, 0))!;
    expect(evening.label).toBe('저녁');
    expect(roundFilled(last, evening.dueAtMs)).toBe(true);
  });

  it('아침만 실렸으면 오후 회차는 비어 있다', async () => {
    const payload = { rounds: [{ slot: '아침', builtAt: new Date(kst(9, 12, 7, 50)).toISOString() }] };
    const ok = (async () => ({ ok: true, json: async () => payload })) as unknown as typeof fetch;
    const last = await lastBuiltAtOf(briefs, ok);
    const afternoon = dueRound(briefs, kst(9, 12, 14, 0))!;
    expect(roundFilled(last, afternoon.dueAtMs)).toBe(false);
  });
});
