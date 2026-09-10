import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { buildEnvelope, judgeRange, type WonRow } from '../blog-class/envelope';
import { isNaverBlogTopic } from '../naver-blog-topics';

/**
 * 이겨본 주제 배선(2026-09-11).
 *
 * 사장님 "내블로그를 분석시키면 내블로그 주제를 가져와서 그걸로 알아서 가져오는거지?"
 * 답은 '아니요'였다 — 주제를 읽어 카드에 한 줄 적는 데만 쓰고 있었다.
 *
 * 실측: measureMyRanks 가 WonRow.topic 을 한 번도 안 넣어서 envelope.topics 가 항상 빈 배열이었고
 * (실주행 봉투: "topics":[]), 그 탓에 judgeRange 의 myTopic 이 **항상 false** 였다.
 * 주제를 쓰려고 만든 자리 다섯 군데가 전부 죽어 있었다:
 *   봉투의 '잘 이기는 이야기' 칸 · 카드의 '내가 이겨본 주제' 배지 ·
 *   오늘 쓸 한 편 줄세우기 1순위 · gate 의 myTopic · selectPicks 의 myTopic.
 *
 * 사장님이 고른 방식: **블로그 설정의 대표 주제**(blogDirectoryName)를 이긴 행에 그대로 단다.
 * 지어내는 분류가 아니라 사장님이 직접 고른 값이라 근거가 분명하다.
 *
 * 그리고 어휘가 맞아야 한다(실측 확인): '인테리어·DIY'·'게임'·'교육·학문'은 32주제에 있고
 * 실시간 틈새 레인이 topic 칸에 넣던 'KAIST'는 없다 — 그건 주제가 아니라 기준 검색어였다.
 */
const root = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');

const row = (over: Partial<WonRow> = {}): WonRow => ({
  keyword: '베란다 청소 방법', blogRank: 4, searchVolume: 90, documentCount: 637916,
  facing: 8, postUrl: 'https://blog.naver.com/me/1', publishedOn: null, ...over,
});

describe('이긴 행에 주제가 붙는다', () => {
  it('순위 단계가 블로그 주제를 받아 행에 단다', () => {
    const rank = read('src', 'main', 'handlers', 'blog-class-rank.ts');
    expect(rank).toContain('blogTopic');
    expect(rank).toContain('isNaverBlogTopic');
    // 아무 문자열이나 주제 칸에 넣지 않는다 — 32주제에 있는 것만
    expect(rank).toMatch(/topic:\s*blogTopic/);
  });

  it('핸들러가 블로그 설정의 대표 주제를 넘긴다', () => {
    const handler = read('src', 'main', 'handlers', 'blog-class.ts');
    expect(handler).toMatch(/blogTopic:\s*.*declaredTopic/);
  });

  it('주제가 붙으면 봉투에 잘 이기는 이야기가 생긴다', () => {
    const env = buildEnvelope([row({ topic: '인테리어·DIY' }), row({ keyword: '타일 바닥 청소', topic: '인테리어·DIY' })])!;
    expect(env.topics).toEqual([{ topic: '인테리어·DIY', count: 2 }]);
  });

  it('같은 주제 후보는 내가 이겨본 주제로 판정된다 — 죽어 있던 자리가 살아난다', () => {
    const env = buildEnvelope([row({ topic: '인테리어·DIY' })])!;
    expect(judgeRange({ documentCount: 1277, facing: 0, topic: '인테리어·DIY' }, env).myTopic).toBe(true);
    expect(judgeRange({ documentCount: 1277, facing: 0, topic: '게임' }, env).myTopic).toBe(false);
  });
});

describe('주제 칸에 주제가 아닌 것을 넣지 않는다', () => {
  it('실시간 틈새 레인이 기준 검색어를 주제 칸에 넣지 않는다', () => {
    const dp = read('src', 'main', 'handlers', 'daily-pick.ts');
    const niche = dp.slice(dp.indexOf('function fromNiche()'), dp.indexOf('export function gatherCandidates'));
    expect(niche, "topic 칸에 baseKeyword 가 들어간다").not.toMatch(/topic:\s*String\(r\.baseKeyword/);
    // 버리지는 않는다 — 왜 나온 말인지에 남긴다
    expect(niche).toContain('baseKeyword');
  });

  it('32주제에 없는 말은 주제로 안 센다', () => {
    expect(isNaverBlogTopic('KAIST')).toBe(false);
    expect(isNaverBlogTopic('인테리어·DIY')).toBe(true);
    const env = buildEnvelope([row({ topic: '인테리어·DIY' })])!;
    expect(judgeRange({ documentCount: 100, facing: 0, topic: 'KAIST' }, env).myTopic).toBe(false);
  });
});
