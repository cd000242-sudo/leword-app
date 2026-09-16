import { describe, expect, it } from 'vitest';
import { buildProfile, sharesVocabulary } from '../blog-class/my-blog-lane';
import { buildTopicProfile } from '../blog-class/topic-profile';

/**
 * 내 블로그 어휘에 '글 전체가 다룬 말'을 더한다 (2026-09-16).
 *
 * 사장님 "내블로그 주제를 파악하고 글들을 전부 분석하고 파악해서 지금 내가쓰면 이기는 키워드를".
 *
 * 그동안 어휘는 **순위를 잰 검색어**에서만 나왔다. 순위를 재는 것은 최근 50편뿐이라,
 * 452편이 다룬 이야기 대부분이 어휘에 없었고 — 어휘에 없으면 여섯 판 후보가 '내 이야기가 아니다'로
 * 걸러졌다(gateWithStats 의 sharesVocabulary). 즉 내가 오래 써 온 분야의 후보가 오히려 탈락했다.
 *
 * 그래서 글 전체에서 센 낱말(topic-profile)을 어휘에 섞는다. 없으면 예전과 똑같이 동작한다.
 */

const won = (keyword: string) => ({
  keyword, blogRank: 5, searchVolume: 300, documentCount: 1000, facing: 2,
});

describe('내 블로그 어휘', () => {
  it('글 전체에서 센 낱말이 어휘에 들어간다', () => {
    const topicProfile = buildTopicProfile([
      { title: '반려견 산책 코스 추천', publishedOn: '2026-08-01', searchable: true },
      { title: '반려견 사료 비교', publishedOn: '2026-08-10', searchable: true },
    ]);
    const profile = buildProfile({ wonRows: [won('욕실 청소 방법')], topicProfile })!;
    expect(profile.vocabulary).toContain('욕실');
    expect(profile.vocabulary).toContain('반려견');
    // 어휘가 넓어지면 그 분야 후보가 관문을 통과한다 — 예전에는 '내 이야기가 아니다'로 빠졌다.
    expect(sharesVocabulary('반려견 유치원 비용', profile.vocabulary)).toBe(true);
  });

  it('순위를 잰 말이 먼저다 — 실제로 붙어 본 말이 더 가까운 근거다', () => {
    const topicProfile = buildTopicProfile([
      { title: '반려견 산책 코스', publishedOn: '2026-08-01', searchable: true },
    ]);
    const profile = buildProfile({ wonRows: [won('욕실 청소')], topicProfile })!;
    expect(profile.vocabulary.indexOf('욕실')).toBeLessThan(profile.vocabulary.indexOf('반려견'));
  });

  it('분야 집계가 없으면 예전과 똑같다', () => {
    const profile = buildProfile({ wonRows: [won('욕실 청소')] })!;
    expect(profile.vocabulary).toEqual(['욕실', '청소']);
  });

  it('같은 낱말이 양쪽에 있어도 한 번만 넣는다', () => {
    const topicProfile = buildTopicProfile([
      { title: '욕실 청소 후기', publishedOn: '2026-08-01', searchable: true },
    ]);
    const profile = buildProfile({ wonRows: [won('욕실 청소')], topicProfile })!;
    expect(profile.vocabulary.filter((w) => w === '욕실')).toHaveLength(1);
  });
});
