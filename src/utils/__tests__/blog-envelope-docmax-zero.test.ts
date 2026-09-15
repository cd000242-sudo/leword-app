import { describe, expect, it } from 'vitest';
import { buildEnvelope, buildNearBand, judgeRange, type WonRow } from '../blog-class/envelope';

/**
 * 문서수를 못 잰 봉투가 모든 후보를 떨구는 결함(2026-09-11).
 *
 * docMax 는 `docs.length > 0 ? Math.max(...docs) : 0` 이었다. 이긴 행이 있는데 그 행의 문서수를
 * 하나도 못 재면(오픈 API 한도·장애) docMax 가 **0** 이 되고, 옛 판정은 `documentCount > docMax`
 * 로 판정했으므로 **문서수가 1개라도 있는 모든 후보가 '범위 밖'** 이 됐다.
 * 화면에는 초록 봉투 상자가 정상으로 떠 있고 결과만 통째로 비는, 원인이 안 보이는 실패다.
 *
 * 크기를 말할 근거가 없으면 봉투를 만들지 않는다 — 이 파일이 원래 세운 원칙이다
 * ("이긴 기록이 없으면 null … 기본값을 지어내지 않는다"). 0 은 기본값이지 실측이 아니다.
 *
 * (2026-09-15) 거르는 기준이 문서수에서 '30위 안에 붙어 본 검색량'으로 바뀌었다 — 문서수를 못 재도
 * 판정이 무너지지 않는다. 봉투를 안 만드는 원칙은 그대로 둔다.
 */
const won = (over: Partial<WonRow> = {}): WonRow => ({
  keyword: '내 글 검색어',
  blogRank: 3,
  searchVolume: 500,
  documentCount: null,
  facing: 2,
  postUrl: 'https://blog.naver.com/me/1',
  publishedOn: '2026-08-01',
  ...over,
});

describe('크기를 못 쟀으면 봉투를 만들지 않는다', () => {
  it('이긴 행이 있어도 문서수가 전부 null 이면 null 이다', () => {
    expect(buildEnvelope([won(), won({ keyword: '둘' })])).toBeNull();
  });

  it('한 행이라도 문서수를 쟀으면 그 값으로 만든다', () => {
    const env = buildEnvelope([won(), won({ keyword: '둘', documentCount: 8200 })]);
    expect(env).not.toBeNull();
    expect(env!.docMax).toBe(8200);
    expect(env!.wonCount).toBe(2);
  });

  it('문서수를 못 재도 판정은 무너지지 않는다 — 거르는 기준에 문서수가 없다', () => {
    // docMax 0 짜리 봉투는 여전히 안 나온다.
    expect(buildEnvelope([won()])).toBeNull();
    // 판정은 30위 안 검색량 범위로 한다 — 문서수가 전부 null 이어도 범위는 선다.
    const band = buildNearBand([won()])!;
    expect(band.volumeMax).toBe(500);
    expect(judgeRange({ searchVolume: 400, topic: '' }, band).verdict).toBe('in');
  });

  it('이긴 기록이 없으면 여전히 null 이다 — 원래 규칙은 그대로', () => {
    expect(buildEnvelope([won({ blogRank: 44, documentCount: 100 })])).toBeNull();
    expect(buildEnvelope([])).toBeNull();
  });

  it('범위가 없으면 판정은 unknown 이다 — 못 잰 것을 탈락으로 바꾸지 않는다', () => {
    expect(judgeRange({ searchVolume: 5000, topic: '' }, null).verdict).toBe('unknown');
  });
});
