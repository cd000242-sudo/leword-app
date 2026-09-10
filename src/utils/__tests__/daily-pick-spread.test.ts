import { describe, expect, it } from 'vitest';
import { gate, type Candidate, type PickSource } from '../../main/handlers/daily-pick';

/**
 * 오늘 쓸 한 편 — 첫 실주행이 0개로 끝난 두 가지 원인(2026-09-11 실측).
 *
 * 저장된 회차(userData/daily-pick/latest.json, 2026-09-10T15:22Z):
 *   모은 것 412 · 봉투 통과 410 · **잰 것 14 · 세운 것 0 · 99초**
 *   그런데 잰 14개가 **전부 '선점 보드'** 였다. 글감 212·추천키워드 320·유튜브 18·틈새 21 에서
 *   잰 것이 하나도 없다. 판 하나가 예산을 통째로 먹었다.
 *
 * 원인: 줄세우기 두 번째 기준이 '글감이 붙었나'인데, 선점 보드 행만 제목 후보를 들고 온다.
 *       그래서 보드 행 전부가 다른 판 전부를 앞선다. "여섯 판이 내놓은 것"이라 적어 놓고
 *       한 판만 재고 있었다.
 *
 * 그리고 그 14개의 판정은 잠김 7 · **반열림 7** 이었다. 반열림은 자리 실측기가
 * "경쟁 있으나 여지 있음"이라 부르는 값이다. 그걸 버리고 0개를 내놓는 것은
 * 잰 사실을 안 쓰는 것이다. (열림 우선, 모자랄 때만 반열림 — 카드에 그대로 적는다.)
 */
const c = (keyword: string, source: PickSource, opts: Partial<Candidate> = {}): Candidate => ({
  keyword,
  source,
  topic: '',
  searchVolume: 1000,
  documentCount: 100,
  facing: null,
  vacancy: null,
  titles: [],
  related: [],
  why: '',
  facts: [],
  ...opts,
});

describe('예산을 판마다 나눠 쓴다', () => {
  it('한 판이 앞자리를 다 먹지 않는다 — 실측 회차의 그 모양을 재현해 막는다', () => {
    // 선점 보드만 글감(titles)을 들고 온다. 실제 발행본이 그렇다.
    const board = Array.from({ length: 20 }, (_, i) =>
      c(`보드${i}`, '선점 보드', { titles: [{ label: '검색용', text: 'x' }], searchVolume: 5000 }));
    const others: Candidate[] = [
      ...Array.from({ length: 20 }, (_, i) => c(`글감${i}`, '오늘의 글감')),
      ...Array.from({ length: 20 }, (_, i) => c(`추천${i}`, '추천키워드')),
      ...Array.from({ length: 20 }, (_, i) => c(`유튜브${i}`, '유튜브')),
      ...Array.from({ length: 20 }, (_, i) => c(`틈새${i}`, '실시간 틈새')),
    ];

    const head = gate([...board, ...others], null, new Set()).slice(0, 14);
    const sources = new Set(head.map((g) => g.candidate.source));
    expect(sources.size, `잰 14개가 ${[...sources].join('·')} 뿐 — 판 하나가 예산을 먹었다`).toBeGreaterThanOrEqual(4);
    // 어느 판도 절반을 넘기지 않는다
    for (const s of sources) {
      const n = head.filter((g) => g.candidate.source === s).length;
      expect(n, `${s} 가 ${n}/14`).toBeLessThanOrEqual(7);
    }
  });

  it('판 안에서는 좋은 것이 먼저다 — 나눠 쓰느라 품질을 버리지 않는다', () => {
    const rows = [
      c('작은글감', '오늘의 글감', { searchVolume: 10 }),
      c('큰글감', '오늘의 글감', { searchVolume: 9000 }),
      c('중간글감', '오늘의 글감', { searchVolume: 500 }),
    ];
    const got = gate(rows, null, new Set()).map((g) => g.candidate.keyword);
    expect(got).toEqual(['큰글감', '중간글감', '작은글감']);
  });

  it('판이 하나뿐이면 그 판을 그대로 다 쓴다 — 나눔이 굶기지 않는다', () => {
    const only = Array.from({ length: 6 }, (_, i) => c(`보드${i}`, '선점 보드'));
    expect(gate(only, null, new Set())).toHaveLength(6);
  });

  it('이미 쓴 검색어는 여전히 빠진다', () => {
    const rows = [c('썼다', '선점 보드'), c('안썼다', '오늘의 글감')];
    const got = gate(rows, null, new Set(['썼다'])).map((g) => g.candidate.keyword);
    expect(got).toEqual(['안썼다']);
  });
});
