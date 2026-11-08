import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LEWORD_PICK_CATEGORY } from '../leword-proof';
import {
  collectTrainingSamples,
  mergeTrainingSamples,
  sampleId,
  toTrainingCsv,
  TRAINING_CSV,
  TRAINING_FILE,
  type TrackedSource,
  type TrainingStore,
} from '../pro-hunter-v12/training-samples';

/**
 * 학습 데이터 모으기(2026-11-08).
 * 노출 추적은 글마다 최근 30회만 남긴다. 학습 데이터는 그 전 기록까지 전부 남겨야 한다.
 */
const row = (over: Partial<TrackedSource> = {}): TrackedSource => ({
  keyword: '베란다 청소 방법',
  postUrl: 'https://blog.naver.com/me/1',
  category: LEWORD_PICK_CATEGORY,
  registeredAt: '2026-09-01T00:00:00.000Z',
  history: [],
  pick: { source: '오늘 쓸 한 편', searchVolume: 90, documentCount: 3615, seat: '열림', facing: 0, measuredAt: '2026-09-01T00:00:00.000Z' },
  ...over,
});
const empty = (): TrainingStore => ({ version: 1, samples: {} });
const NOW = '2026-11-08T00:00:00.000Z';

describe('학습 데이터 모으기', () => {
  it('LEWORD 가 고른 것만 쓴다 — 자동 추출 조각과 pick 없는 옛 기록은 뺀다', () => {
    const store = empty();
    const r = mergeTrainingSamples(store, [
      row(),
      row({ keyword: '왕복 벗고 이등병', category: 'auto-extracted', pick: undefined }),
      row({ keyword: '손 등록', postUrl: 'https://blog.naver.com/me/2', pick: undefined }),
    ], NOW);
    expect(r).toMatchObject({ total: 1, added: 1, skipped: 2, labeled: 0 });
  });

  it('안 잰 것은 정답을 비워 둔다 — 진 것으로 만들지 않는다', () => {
    const store = empty();
    mergeTrainingSamples(store, [row()], NOW);
    const s = Object.values(store.samples)[0];
    expect(s.labels).toMatchObject({ checked: false, bestRank: null, won: null });
    expect(s.features).toMatchObject({ searchVolume: 90, documentCount: 3615, seat: '열림', facing: 0 });
  });

  it('정답을 순위 기록에서 계산한다', () => {
    const store = empty();
    mergeTrainingSamples(store, [row({
      history: [
        { checkedAt: '2026-09-04T00:00:00.000Z', rank: null },
        { checkedAt: '2026-09-08T00:00:00.000Z', rank: 18 },
        { checkedAt: '2026-09-15T00:00:00.000Z', rank: 7 },
        { checkedAt: '2026-09-22T00:00:00.000Z', rank: 9 },
      ],
    })], NOW);
    expect(Object.values(store.samples)[0].labels).toEqual({
      checked: true, checks: 4, bestRank: 7, lastRank: 9, won: true,
      daysToTop10: 14, daysToTop30: 7, observedDays: 21,
    });
  });

  it('노출 추적이 30회에서 잘라도 이전 순위는 남는다', () => {
    const store = empty();
    mergeTrainingSamples(store, [row({ history: [{ checkedAt: '2026-09-02T00:00:00.000Z', rank: 3 }] })], NOW);
    const r = mergeTrainingSamples(store, [row({ history: [{ checkedAt: '2026-10-02T00:00:00.000Z', rank: 25 }] })], NOW);
    const s = store.samples[sampleId('베란다 청소 방법', 'https://blog.naver.com/me/1')];
    expect(s.ranks.map((x) => x.rank)).toEqual([3, 25]);
    expect(s.labels.bestRank).toBe(3);
    expect(r).toMatchObject({ added: 0, updated: 1 });
  });

  it('같은 내용을 다시 넣으면 바뀐 것이 없다', () => {
    const store = empty();
    const h = { history: [{ checkedAt: '2026-09-02T00:00:00.000Z', rank: 3 }] };
    mergeTrainingSamples(store, [row(h)], NOW);
    const r = mergeTrainingSamples(store, [row(h)], '2026-11-09T00:00:00.000Z');
    expect(r).toMatchObject({ added: 0, updated: 0, total: 1 });
    expect(Object.values(store.samples)[0].updatedAt).toBe(NOW);
  });

  it('CSV 는 엑셀용 BOM 을 달고, 못 잰 칸은 빈칸, 쉼표는 따옴표로 감싼다', () => {
    const store = empty();
    mergeTrainingSamples(store, [row({ keyword: '청소, 방법', pick: { source: 'x', searchVolume: null, documentCount: 10, seat: null, facing: null, measuredAt: NOW } })], NOW);
    const csv = toTrainingCsv(store);
    expect(csv.startsWith('﻿keyword,')).toBe(true);
    expect(csv.split('\n')[1].startsWith('"청소, 방법",https://blog.naver.com/me/1,2026-09-01T00:00:00.000Z,x,,10,,,')).toBe(true);
  });

  it('파일로 쌓고 다시 불러와 이어 쌓는다', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leword-training-'));
    try {
      collectTrainingSamples(dir, [row({ history: [{ checkedAt: '2026-09-02T00:00:00.000Z', rank: 3 }] })]);
      const r = collectTrainingSamples(dir, [row({ history: [{ checkedAt: '2026-10-02T00:00:00.000Z', rank: 12 }] })]);
      expect(r).toMatchObject({ total: 1, labeled: 1, updated: 1 });
      const saved = JSON.parse(fs.readFileSync(path.join(dir, TRAINING_FILE), 'utf8'));
      expect(Object.values<any>(saved.samples)[0].ranks).toHaveLength(2);
      expect(fs.readFileSync(path.join(dir, TRAINING_CSV), 'utf8').split('\n').filter(Boolean)).toHaveLength(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('노출 추적에 연결돼 있다', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../main/handlers/exposure-tracking.ts'), 'utf8');
  it('앱 시작 때와 순위 확인 뒤에 학습 데이터를 쌓는다', () => {
    expect(src).toContain("import { collectTrainingSamples } from '../../utils/pro-hunter-v12/training-samples'");
    expect(src).toContain("collectTrainingData(readJson<TrackedKeyword[]>(FILE_TRACKED(), []), '시작 시 옮기기')");
    const write = src.indexOf('writeJson(FILE_TRACKED(), tracked);\n        collectTrainingData(tracked,');
    expect(write).toBeGreaterThan(0);
  });
});
