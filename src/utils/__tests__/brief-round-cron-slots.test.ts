import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { scheduledRound } from '../topic-briefs';

/**
 * 워크플로의 **실제 예약**이 제 회차로 간다 (2026-09-15, 2시간 앞당긴 뒤).
 *
 * brief-round-slot.test 는 옛 예약(21·22·23 / 3·4·5 / 9·10·11 UTC)으로 규칙을 재고 있어
 * 경계를 9·15시로 옮긴 뒤에도 우연히 통과했다 — 새 예약이 어디로 가는지는 아무것도 안 잠갔다.
 * 여기서는 topic-briefs.yml 을 읽어 그 아홉 틱을 그대로 넣는다. 특히 아침 틱은 UTC 로
 * **전날**(19·20·21시)이라 날짜가 한국 날짜로 붙는지가 관건이다.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'topic-briefs.yml'), 'utf8');
const crons = [...workflow.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);

describe('워크플로의 실제 예약이 제 회차로 간다', () => {
  it('아홉 틱이 아침×3 · 오후×3 · 저녁×3 순서다', () => {
    const at = new Date('2026-09-15T10:00:00Z'); // KST 19:00 — 그날 아홉 틱이 다 지난 뒤
    expect(crons).toHaveLength(9);
    expect(crons.map((c) => scheduledRound(c, at)!.slot)).toEqual([
      '아침', '아침', '아침', '오후', '오후', '오후', '저녁', '저녁', '저녁',
    ]);
  });

  it('아침 틱은 UTC 로 전날이다 — 날짜는 한국 날짜로 붙는다', () => {
    expect(scheduledRound('23 19 * * *', new Date('2026-09-14T19:23:30Z'))).toEqual({ day: '2026-09-15', slot: '아침' });
  });

  it('아침 틱이 5시간 늦어 한국 아침 9시 반에 돌아도 같은 아침 회차다', () => {
    expect(scheduledRound('23 19 * * *', new Date('2026-09-15T00:30:00Z'))).toEqual({ day: '2026-09-15', slot: '아침' });
  });

  it('저녁 틱이 자정을 넘겨 돌아도 어제 저녁이다', () => {
    expect(scheduledRound('23 9 * * *', new Date('2026-09-15T15:40:00Z'))).toEqual({ day: '2026-09-15', slot: '저녁' });
  });
});
