import { describe, expect, it } from 'vitest';
import { NAVER_BLOG_TOPIC_LABELS } from '../naver-blog-topics';
import { BIZTP_TOP_N } from '../seed-db';
import {
  HINT_ROWS_CAP,
  SEED_HINTS,
  hintSourceTag,
  preferSource,
  warehouseNeedsRebuild,
} from '../seed-hints';

/**
 * 힌트 창구(2026-09-08).
 *
 * 왜: 32주제 첫 회차 뒤 창고를 주제별로 세어 보니 **열 주제가 0개**였다 —
 * 영화·드라마·방송·스타·연예인·음악·만화·애니·미술·디자인·사진·좋은글·이미지·원예·재배.
 * 창고를 다 뒤져도 없었다. 검색광고 업종 창구가 **광고주용**이라 연예·문화
 * 콘텐츠가 애초에 안 실린다. 그래서 같은 API 의 hintKeywords 로 주제별 머리말을
 * 넣어 연관어를 받아 오고, 출처를 `hint:주제` 로 남겨 **출처로** 라우팅한다.
 * 말(정규식)로 잡으면 부분일치 오탐이 따라오지만, 출처는 그 위험이 없다.
 */

const ZERO_WAREHOUSE_TOPICS = [
  '영화', '드라마', '방송', '스타·연예인', '음악',
  '만화·애니', '미술·디자인', '사진', '좋은글·이미지', '원예·재배',
];

describe('힌트 씨앗 표', () => {
  it('모든 주제가 실제 네이버 블로그 주제다 — 오타면 아무도 안 파는 주제로 간다', () => {
    for (const topic of Object.keys(SEED_HINTS)) {
      expect(NAVER_BLOG_TOPIC_LABELS, `${topic} 은 블로그 주제가 아니다`).toContain(topic);
    }
  });

  it('창고에서 0개 받던 열 주제가 전부 들어 있다', () => {
    for (const topic of ZERO_WAREHOUSE_TOPICS) {
      expect(SEED_HINTS[topic]?.length ?? 0, `${topic} 머리말이 부족하다`).toBeGreaterThanOrEqual(4);
    }
  });

  /*
   * hintKeywords 는 15자에서 잘린다. 잘린 머리말은 **다른 키워드의** 연관어를
   * 조용히 돌려준다(naver-searchad-api 의 preservesExactSearchAdHint 가 그래서 있다).
   * 공백은 API 가 지우므로 처음부터 안 넣는다. 특수문자는 빈손으로 온다.
   */
  it('머리말은 15자 이하 · 공백 없음 · 한글영숫자만', () => {
    for (const [topic, heads] of Object.entries(SEED_HINTS)) {
      for (const head of heads) {
        expect(head.length, `${topic}/${head} 가 15자를 넘는다`).toBeLessThanOrEqual(15);
        expect(head, `${topic}/${head} 에 공백이 있다`).not.toMatch(/\s/);
        expect(head, `${topic}/${head} 에 특수문자가 있다`).toMatch(/^[가-힣A-Za-z0-9]+$/);
      }
    }
  });

  it('머리말이 주제 간에 겹치지 않는다 — 겹치면 한 말이 두 주제로 간다', () => {
    const seen = new Map<string, string>();
    for (const [topic, heads] of Object.entries(SEED_HINTS)) {
      for (const head of heads) {
        expect(seen.get(head), `${head} 가 ${seen.get(head)} 와 ${topic} 에 다 있다`).toBeUndefined();
        seen.set(head, topic);
      }
    }
  });

  /*
   * 업종 창구는 51위부터 딴 밭이 섞였다(biztp:15 금시세 → 양말·골프웨어). 그래서
   * 업종은 상위 300 만 쓴다. 힌트도 연관어 꼬리는 같은 병이 있으니 그보다 넓게
   * 잡지 않는다 — 살아 있는 감사 없이 처음 여는 창구라 좁게 시작한다.
   */
  it('힌트 상한이 업종 상한보다 크지 않다', () => {
    expect(HINT_ROWS_CAP).toBeGreaterThan(0);
    expect(HINT_ROWS_CAP).toBeLessThanOrEqual(BIZTP_TOP_N);
  });

  it('출처 꼬리표는 hint:주제 꼴이다', () => {
    expect(hintSourceTag('영화')).toBe('hint:영화');
  });
});

/*
 * 같은 말이 여러 창구에서 오면 어느 출처를 남기나.
 *
 * 창고를 세어 보니 업종 창구 행 84,882개 중 21,899개가 **먼저 긁은 월·시즌 창구에
 * 가려져** 출처를 잃었다. 월·시즌 출처는 주제가 없어 라우팅이 안 되므로, 그 말이
 * 업종에서도 왔다는 사실이 통째로 버려진 것이다. 주제를 아는 출처가 이겨야 한다.
 */
describe('출처 우선순위 — 힌트 > 업종 > 월·시즌', () => {
  it('주제 있는 출처가 주제 없는 출처를 이긴다 — 순서와 무관하게', () => {
    expect(preferSource('month:1', 'biztp:17')).toBe('biztp:17');
    expect(preferSource('biztp:17', 'month:1')).toBe('biztp:17');
    expect(preferSource('event:3', 'hint:영화')).toBe('hint:영화');
  });

  it('힌트가 업종을 이긴다 — 힌트는 주제를 직접 가리킨다', () => {
    expect(preferSource('biztp:17', 'hint:영화')).toBe('hint:영화');
    expect(preferSource('hint:영화', 'biztp:17')).toBe('hint:영화');
  });

  it('같은 급이면 먼저 만난 출처를 남긴다 — 옛 동작 그대로', () => {
    expect(preferSource('event:3', 'month:1')).toBe('event:3');
    expect(preferSource('biztp:5', 'biztp:44')).toBe('biztp:5');
    expect(preferSource('hint:영화', 'hint:드라마')).toBe('hint:영화');
  });

  it('출처가 비어 있으면 있는 쪽을 쓴다', () => {
    expect(preferSource('', 'month:1')).toBe('month:1');
    expect(preferSource(undefined, 'biztp:2')).toBe('biztp:2');
  });
});

describe('창고를 다시 긁어야 하나', () => {
  const now = new Date('2026-09-08T00:00:00Z');
  const fresh = (extra: object = {}) => ({
    builtAt: '2026-09-07T06:00:00Z',
    sources: { month: {}, event: {}, biztp: {}, hint: {} },
    ...extra,
  });

  it('신선하고 힌트 창구도 있으면 그대로 쓴다', () => {
    expect(warehouseNeedsRebuild(fresh(), { maxAgeDays: 3, now })).toBe(false);
  });

  it('3일이 넘으면 다시 긁는다 — 월·금 갱신', () => {
    expect(warehouseNeedsRebuild(fresh({ builtAt: '2026-09-04T00:00:00Z' }), { maxAgeDays: 3, now })).toBe(true);
  });

  /*
   * 힌트 창구를 연 날, 레포에 있는 창고는 하루 전 것이라 신선하다. 날짜만 보면
   * 건너뛰고, 열 주제는 다음 회차까지 또 0개다. 옛 꼴은 신선해도 다시 긁는다.
   */
  it('힌트 창구가 없는 옛 창고는 신선해도 다시 긁는다', () => {
    expect(warehouseNeedsRebuild(fresh({ sources: { month: {}, event: {}, biztp: {} } }), { maxAgeDays: 3, now })).toBe(true);
  });

  it('창고가 없거나 날짜가 깨졌으면 다시 긁는다', () => {
    expect(warehouseNeedsRebuild(null, { maxAgeDays: 3, now })).toBe(true);
    expect(warehouseNeedsRebuild(fresh({ builtAt: '깨진값' }), { maxAgeDays: 3, now })).toBe(true);
  });
});
