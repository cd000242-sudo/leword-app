import { describe, expect, it } from 'vitest';
import { FREE_SAMPLE_SIZE, repairFreeSample } from '../free-sample';

/**
 * 무료 맛보기 다섯이 한 장으로 줄어 있던 것(2026-09-11).
 *
 * 실측(leaderspro.kr/data/preemption-board.json, 발행 2026-09-09):
 *   행 43개 · freeSample.day 2026-09-09 · keywords 5개
 *   그중 보드에 남아 있는 것은 '제주렌트카 본사' **하나뿐**이었다.
 *   화면은 순번이 아니라 이름으로 잠금을 푸니까 비로그인 방문자는 카드 한 장만 봤다
 *   (사장님 "황금키워드는 1개만 보인다고 문의왔어요").
 *
 * 원인: 발행기가 같은 날(KST)이면 직전 발행본의 다섯을 **그대로 재사용**했다.
 * 하루 고정이라는 의도는 옳다(사장님 2026-08-20: 새로고침이 곧 무료 발굴이 되면 안 된다).
 * 빠진 것은 "그 이름이 아직 보드에 있는가" 확인뿐이다.
 *
 * ⚠ 사이트 레포에 쌍둥이가 있다: spa/src/lib/freeSample.mjs + scripts/tests/free-sample-repair.test.mjs.
 *   레포가 달라 한 파일을 공유할 수 없다. 아래 붙박이는 그쪽 테스트와 같은 것이어야 한다.
 */
const board = (names: string[]) => ({ rows: names.map((keyword) => ({ keyword })) });

describe('하루 고정은 지키고 사라진 자리만 메운다', () => {
  it('다섯이 다 살아 있으면 그대로 둔다', () => {
    const b = board(['가', '나', '다', '라', '마', '바']);
    expect(repairFreeSample(b, ['나', '다', '라', '마', '바'])).toEqual(['나', '다', '라', '마', '바']);
  });

  it('살아남은 이름은 자리를 지키고, 사라진 자리만 앞줄로 채운다', () => {
    const b = board(['가', '나', '다', '라', '마', '바']);
    const got = repairFreeSample(b, ['바', '없는것1', '없는것2', '없는것3', '없는것4']);
    expect(got).toHaveLength(FREE_SAMPLE_SIZE);
    expect(got[0]).toBe('바');
    expect(got.slice(1)).toEqual(['가', '나', '다', '라']);
  });

  it('실측한 그 판을 재현한다 — 하나만 남았어도 다섯을 준다', () => {
    const b = board(['제주렌트카 본사', '행A', '행B', '행C', '행D', '행E']);
    const got = repairFreeSample(b, ['전설의사내시청률', '제주렌트카 본사', '다이소 증명사진 출력', '셀레나 이러닝', '현대자동차 견적내기']);
    expect(got).toHaveLength(5);
    expect(got).toContain('제주렌트카 본사');
  });
});

describe('지어내지 않는다', () => {
  it('보드가 다섯보다 적으면 있는 만큼만', () => {
    expect(repairFreeSample(board(['가', '나']), null)).toEqual(['가', '나']);
    expect(repairFreeSample(board([]), ['가'])).toEqual([]);
  });

  it('발행본이 없으면 보드 앞줄 다섯', () => {
    expect(repairFreeSample(board(['가', '나', '다', '라', '마', '바']), null)).toEqual(['가', '나', '다', '라', '마']);
  });

  it('같은 이름을 두 번 넣지 않는다', () => {
    const got = repairFreeSample(board(['가', '나', '다', '라', '마']), ['가', '가', '가']);
    expect(new Set(got).size).toBe(got.length);
    expect(got).toHaveLength(5);
  });

  it('원본을 건드리지 않는다', () => {
    const b = board(['가', '나', '다']);
    const published = ['가'];
    repairFreeSample(b, published);
    expect(published).toEqual(['가']);
    expect(b.rows).toHaveLength(3);
  });
});

describe('발행기가 실제로 이 규칙을 쓴다', () => {
  it('직전 것을 통째로 재사용하지 않는다', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'publish-preemption-board.js'), 'utf8');
    expect(src).toContain('repairFreeSample(merged, carried)');
    expect(src, '옛 재사용이 남아 있다').not.toContain('? previousSample\n');
  });
});
