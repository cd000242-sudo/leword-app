/**
 * 네이버 블로그 주제 분류 — 글쓰기 화면의 "주제 설정" 32종.
 *
 * 왜 코드에 두는가:
 *   주제를 고르면 내블로그와 블로그 홈에서 주제별로 노출된다. 즉 홈판 노출
 *   경로가 주제에 걸려 있어서, 키워드를 발굴해 놓고 주제를 엉뚱하게 고르면
 *   그 글은 애초에 다른 독자 앞에 서지 못한다. 실시간 검색어에서 글감을
 *   뽑아 주는 이상 "이건 어느 주제로 올려야 하는가"까지 알려줘야 한다.
 *
 * 출처: 네이버 블로그 글쓰기 → 주제 설정 (2026-08 기준 실제 화면).
 * 임의로 만든 분류가 아니라 네이버가 제공하는 목록 그대로다.
 * 네이버가 목록을 바꾸면 여기도 바꿔야 한다.
 */

export type NaverBlogTopicGroup =
  | '엔터테인먼트·예술'
  | '생활·노하우·쇼핑'
  | '취미·여가·여행'
  | '지식·동향';

export interface NaverBlogTopic {
  /** 화면에 표시되는 주제명. 네이버 표기 그대로. */
  label: string;
  group: NaverBlogTopicGroup;
}

export const NAVER_BLOG_TOPICS: readonly NaverBlogTopic[] = Object.freeze([
  // 엔터테인먼트·예술
  { label: '문학·책', group: '엔터테인먼트·예술' },
  { label: '영화', group: '엔터테인먼트·예술' },
  { label: '미술·디자인', group: '엔터테인먼트·예술' },
  { label: '공연·전시', group: '엔터테인먼트·예술' },
  { label: '음악', group: '엔터테인먼트·예술' },
  { label: '드라마', group: '엔터테인먼트·예술' },
  { label: '스타·연예인', group: '엔터테인먼트·예술' },
  { label: '만화·애니', group: '엔터테인먼트·예술' },
  { label: '방송', group: '엔터테인먼트·예술' },

  // 생활·노하우·쇼핑
  { label: '일상·생각', group: '생활·노하우·쇼핑' },
  { label: '육아·결혼', group: '생활·노하우·쇼핑' },
  { label: '반려동물', group: '생활·노하우·쇼핑' },
  { label: '좋은글·이미지', group: '생활·노하우·쇼핑' },
  { label: '패션·미용', group: '생활·노하우·쇼핑' },
  { label: '인테리어·DIY', group: '생활·노하우·쇼핑' },
  { label: '요리·레시피', group: '생활·노하우·쇼핑' },
  { label: '상품리뷰', group: '생활·노하우·쇼핑' },
  { label: '원예·재배', group: '생활·노하우·쇼핑' },

  // 취미·여가·여행
  { label: '게임', group: '취미·여가·여행' },
  { label: '스포츠', group: '취미·여가·여행' },
  { label: '사진', group: '취미·여가·여행' },
  { label: '자동차', group: '취미·여가·여행' },
  { label: '취미', group: '취미·여가·여행' },
  { label: '국내여행', group: '취미·여가·여행' },
  { label: '세계여행', group: '취미·여가·여행' },
  { label: '맛집', group: '취미·여가·여행' },

  // 지식·동향
  { label: 'IT·컴퓨터', group: '지식·동향' },
  { label: '사회·정치', group: '지식·동향' },
  { label: '건강·의학', group: '지식·동향' },
  { label: '비즈니스·경제', group: '지식·동향' },
  { label: '어학·외국어', group: '지식·동향' },
  { label: '교육·학문', group: '지식·동향' },
]);

/** "주제 선택 안 함" 도 실제 선택지다. 분류 실패 시 임의로 찍지 않기 위해 둔다. */
export const NAVER_BLOG_TOPIC_NONE = '주제 선택 안 함';

export const NAVER_BLOG_TOPIC_LABELS: readonly string[] = Object.freeze(
  NAVER_BLOG_TOPICS.map((topic) => topic.label),
);

export function isNaverBlogTopic(label: string): boolean {
  return NAVER_BLOG_TOPIC_LABELS.includes(String(label || '').trim());
}

export function topicsByGroup(group: NaverBlogTopicGroup): NaverBlogTopic[] {
  return NAVER_BLOG_TOPICS.filter((topic) => topic.group === group);
}
