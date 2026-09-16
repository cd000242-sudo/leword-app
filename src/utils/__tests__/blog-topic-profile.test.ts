import { describe, expect, it } from 'vitest';
import { buildTopicProfile, type TopicPost } from '../blog-class/topic-profile';

/**
 * 내 블로그가 실제로 무엇을 써 왔나 — 글 전체에서 센 사실(2026-09-16).
 *
 * 사장님 "내블로그 크기를 재면 내블로그 주제를 파악하고 글들을 전부 분석하고 파악해서
 * 지금 내가쓰면 이기는 키워드를 분석해서 알려줘야되는거아니니?? 지금 보면 전혀아니야".
 *
 * 그동안은 최근 50개 제목만 읽었고, 주제는 네이버 설정값 한 줄(declaredTopic)을 그대로 옮겼을 뿐이다.
 * 452개 글이 쌓아 온 것이 후보 생성에 한 번도 안 쓰였다.
 *
 * 여기서 만드는 것은 **센 값**뿐이다 — 어떤 낱말이 몇 편에 나왔나. 점수도, 분류 추정도 만들지 않는다.
 * (32주제 분류 함수는 없고, 없는 분류를 지어내면 "네 주제는 이것"이라는 거짓말이 된다.)
 */

const post = (title: string, over: Partial<TopicPost> = {}): TopicPost => ({
  title,
  publishedOn: '2026-09-01',
  searchable: true,
  ...over,
});

describe('내 블로그 분야 집계', () => {
  it('글이 없으면 만들지 않는다 — 빈 프로필을 지어내지 않는다', () => {
    expect(buildTopicProfile([])).toBeNull();
  });

  it('낱말은 글 수로 센다 — 한 편에 두 번 나와도 한 편이다', () => {
    const profile = buildTopicProfile([
      post('욕실 청소 방법과 욕실 곰팡이'),
      post('베란다 청소 요령'),
    ])!;
    const 욕실 = profile.words.find((w) => w.word === '욕실');
    expect(욕실).toEqual({ word: '욕실', posts: 1 });
    expect(profile.words.find((w) => w.word === '청소')).toEqual({ word: '청소', posts: 2 });
  });

  it('군더더기 · 한 글자 · 숫자만은 낱말로 치지 않는다', () => {
    const profile = buildTopicProfile([post('2026 타일 바닥 청소 방법 추천 후기')])!;
    const words = profile.words.map((w) => w.word);
    expect(words).toContain('타일');
    expect(words).not.toContain('방법');
    expect(words).not.toContain('추천');
    expect(words).not.toContain('후기');
    expect(words).not.toContain('2026');
  });

  it('많이 쓴 낱말이 앞이고, 같으면 가나다 순이다', () => {
    const profile = buildTopicProfile([
      post('욕실 청소'), post('욕실 곰팡이'), post('욕실 배수구'),
      post('주방 청소'), post('베란다 청소'),
    ])!;
    expect(profile.words.slice(0, 2).map((w) => w.word)).toEqual(['욕실', '청소']);
  });

  it('최근에 쓰는 것은 따로 센다 — 블로그가 옮겨 간 자리를 알 수 있게', () => {
    const now = Date.parse('2026-09-16T00:00:00Z');
    const profile = buildTopicProfile([
      post('욕실 청소 요령', { publishedOn: '2026-09-10' }),
      post('타일 바닥 시공', { publishedOn: '2024-01-05' }),
      post('타일 줄눈 보수', { publishedOn: '2024-02-05' }),
    ], { now })!;
    expect(profile.words[0].word).toBe('타일');
    expect(profile.recentWords.map((w) => w.word)).toEqual(['요령', '욕실', '청소']);
  });

  it('검색 허용이 꺼진 글도 분야에는 센다 — 순위 후보에서만 빠지는 것이다', () => {
    const profile = buildTopicProfile([post('반려견 산책 코스', { searchable: false })])!;
    expect(profile.words.map((w) => w.word)).toContain('반려견');
    expect(profile.analyzed).toBe(1);
  });

  it('몇 편 중 몇 편을 봤는지 그대로 적는다', () => {
    const profile = buildTopicProfile([post('욕실 청소')], { totalPosts: 452 })!;
    expect(profile.analyzed).toBe(1);
    expect(profile.totalPosts).toBe(452);
  });

  /**
   * 실주행(2026-09-16, leadernam- 452편)에서 잡은 결함.
   * 상위가 '만에(32) · 마세요(20) · 하나로(18) · 없이(16) · 10분(19) · 3가지 · 100%' 였다 —
   * 분야가 아니라 **제목 문체와 숫자 표현**이다. 이 말이 어휘에 들어가면 관문(sharesVocabulary)이
   * '10분'만 겹쳐도 아무 후보나 통과시킨다. 분야를 넓히려다 오히려 더 엉뚱해진다.
   */
  it('제목 문체와 숫자 표현은 분야가 아니다', () => {
    const profile = buildTopicProfile([
      post('10분 만에 곰팡이 제거, 이것 하나로 끝'),
      post('세제 없이 냄새 잡는 법, 이제 사지 마세요'),
      post('3가지만 알면 100% 줄어드는 먼지'),
    ])!;
    const words = profile.words.map((w) => w.word);
    expect(words).toContain('곰팡이');
    expect(words).toContain('냄새');
    expect(words).toContain('먼지');
    for (const noise of ['10분', '만에', '하나로', '없이', '마세요', '3가지', '100%', '줄어드는']) {
      expect(words).not.toContain(noise);
    }
  });

  /**
   * 2차 실주행(2026-09-16)에서 남은 잡음.
   * 문체어는 걷혔는데 '순서와(12)'(조사가 붙은 말) · '남은(10)'(관형형) · '갈려요'(종결형)가 남았다.
   * 관문은 낱말이 겹치기만 하면 통과시키므로, 이런 범용어가 어휘에 있으면 또 엉뚱한 후보가 들어온다.
   */
  it('조사가 붙은 말 · 관형형 · 종결형은 분야가 아니다', () => {
    /*
     * 조사를 잘라 원형을 만들지는 않는다 — 형태소 분석기 없이 자르면 '곰팡이'가 '곰팡'이 되고
     * '습도'가 '습'이 된다(끝 글자만 보면 조사와 이름씨의 끝을 구별할 수 없다).
     * 없는 말을 지어내느니 그 형태를 버린다. 원형은 다른 글에서 조사 없이 나오면 그때 잡힌다.
     */
    const profile = buildTopicProfile([
      post('에어컨 청소 순서와 주의사항'),
      post('남은 음식 보관 요령'),
      post('이렇게 하면 때가 잘 갈려요'),
    ])!;
    const words = profile.words.map((w) => w.word);
    expect(words).toContain('에어컨');
    expect(words).toContain('주의사항');
    expect(words).toContain('음식');
    expect(words).not.toContain('순서와');
    expect(words).not.toContain('남은');
    expect(words).not.toContain('갈려요');
  });

  it('상위 몇 개까지 볼지는 부르는 쪽이 정한다', () => {
    const profile = buildTopicProfile([post('욕실 청소 곰팡이 제거 세제')], { limit: 2 })!;
    expect(profile.words).toHaveLength(2);
  });
});
