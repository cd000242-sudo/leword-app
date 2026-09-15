import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { isPracticalIntentKeyword, pickMeasureSample } from '../candidate-sample';

/**
 * 검색량 표본 — 실용 말을 먼저 잰다(2026-09-15, 사장님 "실용 말을 먼저 재기").
 *
 * 깔때기 실측: 실용 의도 말 6,623개 중 3,087개(47%)가 표본 상한 밖이라 검색량을 안 쟀다.
 * 표본 수 · 관문은 그대로 두고 순서만 바꾼다. 씨앗별로 돌아가며 뽑는 규칙은 지킨다.
 */
const root = path.join(__dirname, '..', '..', '..');

type Row = { keyword: string; seed: string };
const row = (keyword: string, seed: string): Row => ({ keyword, seed });

/** 바꾸기 전 스크립트의 표본 규칙 그대로 — 실용 말이 없을 때는 결과가 같아야 한다. */
function oldSample(rows: Row[], cap: number): Row[] {
  const bySeedQueue = new Map<string, Row[]>();
  for (const item of rows) {
    if (!bySeedQueue.has(item.seed)) bySeedQueue.set(item.seed, []);
    bySeedQueue.get(item.seed)!.push(item);
  }
  const phraseList: Row[] = [];
  const queues = [...bySeedQueue.values()];
  for (let round = 0; phraseList.length < cap; round += 1) {
    let added = 0;
    for (const queue of queues) {
      if (round >= queue.length) continue;
      phraseList.push(queue[round]);
      added += 1;
      if (phraseList.length >= cap) break;
    }
    if (added === 0) break;
  }
  return phraseList;
}

describe('실용 의도 판정', () => {
  it('분류기가 정보 · 비교 · 거래로 보는 말만 실용이다 — 상품명은 아니다', () => {
    expect(isPracticalIntentKeyword('척추전방전위증 증상')).toBe(true);
    expect(isPracticalIntentKeyword('우체국 알뜰폰 요금제')).toBe(true);
    expect(isPracticalIntentKeyword('꼼지락 차박매트')).toBe(false);
    expect(isPracticalIntentKeyword('')).toBe(false);
  });
});

describe('표본 뽑기', () => {
  const practical = (item: Row) => item.keyword.startsWith('실용');
  const rows = [
    row('일반 a1', 'A'), row('실용 a2', 'A'), row('일반 a3', 'A'), row('실용 a4', 'A'),
    row('일반 b1', 'B'), row('일반 b2', 'B'), row('실용 b3', 'B'),
    row('일반 c1', 'C'),
  ];

  it('실용 말을 먼저 씨앗별로 돌아가며 넣고, 남은 자리를 나머지로 채운다', () => {
    const sample = pickMeasureSample(rows, 6, practical);
    expect(sample.rows.map((item) => item.keyword)).toEqual(['실용 a2', '실용 b3', '실용 a4', '일반 a1', '일반 b1', '일반 c1']);
    expect(sample).toMatchObject({ practicalTotal: 3, practicalSampled: 3 });
  });

  it('실용 말이 상한보다 많으면 실용 말만, 씨앗별로 돌아가며', () => {
    const sample = pickMeasureSample(rows, 2, practical);
    expect(sample.rows.map((item) => item.keyword)).toEqual(['실용 a2', '실용 b3']);
    expect(sample).toMatchObject({ practicalTotal: 3, practicalSampled: 2 });
  });

  it('실용 말이 없으면 바꾸기 전 규칙과 순서까지 같다', () => {
    const plain = rows.filter((item) => !practical(item));
    for (const cap of [0, 1, 3, 5, 100]) {
      expect(pickMeasureSample(plain, cap, practical).rows).toEqual(oldSample(plain, cap));
    }
  });

  it('표본 수는 상한을 넘지 않고, 문장이 적으면 전부 잰다 — 같은 말을 두 번 넣지 않는다', () => {
    const everything = pickMeasureSample(rows, 100, practical).rows;
    expect(everything).toHaveLength(rows.length);
    expect(new Set(everything).size).toBe(rows.length);
    expect(pickMeasureSample(rows, 0, practical).rows).toEqual([]);
    expect(pickMeasureSample(rows, Number.NaN, practical).rows).toEqual([]);
  });

  it('판정을 안 주면 분류기로 가른다', () => {
    const sample = pickMeasureSample([row('꼼지락 차박매트', 'A'), row('척추전방전위증 증상', 'A')], 1);
    expect(sample.rows.map((item) => item.keyword)).toEqual(['척추전방전위증 증상']);
  });
});

describe('선점 후보 스크립트에 배선된다', () => {
  const script = fs.readFileSync(path.join(root, 'scripts', 'preemption-candidates.js'), 'utf8');

  it('표본은 공용 함수로 뽑는다 — 옛 손 루프는 남지 않는다', () => {
    expect(script).toContain("require('../src/utils/candidate-sample')");
    expect(script).toContain('pickMeasureSample(phrases.values(), sampleCap)');
    expect(script).not.toContain('phraseList.push(queue[round])');
  });

  it('표본 수 규칙은 그대로다 — 순서만 바꿨다', () => {
    expect(script).toContain("const sampleCapArg = Number(arg('sampleCap')) || perTopic * 20;");
    expect(script).toContain('const sampleCap = pastHardStop() ? Math.min(sampleCapArg, perTopic * 5) : sampleCapArg;');
  });
});
