import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const { defaultTopicConcurrency } = require('../../../scripts/candidate-shards');

/**
 * 돈 되는 황금키워드 배선 — 입찰가가 어디서 재져서 어디로 실리는지 파일로 대조한다(2026-09-24).
 *
 * 필드가 한 자리에서만 빠져도 화면은 '못 잰 것'으로 보인다(선점 timing 배선 사고와 같은 꼴).
 * 발행은 게이트를 통과한 공개 행(merged.rows)에 직접 싣는다 — 그 배열이 그대로 board.json 이 된다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('황금키워드 보드', () => {
  it('발행이 입찰가를 재서 공개 행에 돈 판정을 싣는다', () => {
    const script = read('scripts/publish-preemption-board.js');
    expect(script).toContain('getNaverSearchAdBidPairs');
    expect(script).toMatch(/merged\.rows = merged\.rows\.map\(\(row\) => \(\{ \.\.\.row, money: moneyBidOf\(/);
  });

  it('돈 되는 주제는 창고 씨앗을 입찰가 순으로 뽑는다', () => {
    const script = read('scripts/preemption-candidates.js');
    expect(script).toContain('isMoneyTopic(topic)');
    expect(script).toContain('orderSeedsByBid(');
  });

  /*
   * 굶김 실측(2026-09-21 회차): 샤드마다 주제 7~9개인데 동시 실행이 6이라, 앞의 6개가 3시간 20분을
   * 다 쓰고 7번째부터는 20~30초 만에 구절 0개로 끝났다. 그 자리에 비즈니스·경제 · 건강·의학 ·
   * 교육·학문 · IT·컴퓨터가 앉아 있었다. 호출 간격은 공용이라 동시 실행을 늘려도 API 부하는 그대로다.
   */
  it('샤드로 나누면 맡은 주제를 전부 한꺼번에 돌린다 — 뒷자리 주제가 굶지 않는다', () => {
    expect(defaultTopicConcurrency({ shards: 4, topicCount: 9 })).toBe(9);
    expect(defaultTopicConcurrency({ shards: 4, topicCount: 7 })).toBe(7);
    expect(defaultTopicConcurrency({ shards: 4, topicCount: 3 })).toBe(6);
  });

  it('샤드가 없으면(로컬 전체 실행) 예전처럼 6개다', () => {
    expect(defaultTopicConcurrency({ shards: 1, topicCount: 32 })).toBe(6);
  });

  it('후보 스크립트가 그 기본값을 쓴다', () => {
    const script = read('scripts/preemption-candidates.js');
    expect(script).toContain('defaultTopicConcurrency(');
  });
});

describe('오늘의 추천키워드', () => {
  it('종목 이름을 빼고, 입찰가를 재서 황금을 돈 되는 순으로 세운다', () => {
    const script = read('scripts/today-picks.js');
    expect(script).toContain('listedNamesFromSeeds(');
    expect(script).toContain('getNaverSearchAdBidPairs');
    expect(script).toContain('orderGoldenByMoney(');
  });

  it('워크플로가 뽑기 단계에 검색광고 키를 넘기고, 주제당 30개를 남긴다', () => {
    const yml = read('.github/workflows/today-picks.yml');
    const step = yml.slice(yml.indexOf('- name: 추천키워드 뽑기'), yml.indexOf('- name: 사이트에 싣기'));
    expect(step).toContain('NAVER_SEARCH_AD_ACCESS_LICENSE');
    expect(step).toContain('NAVER_SEARCH_AD_SECRET_KEY');
    expect(step).toContain('NAVER_SEARCH_AD_CUSTOMER_ID');
    expect(step).toContain('--keep=30');
  });
});
