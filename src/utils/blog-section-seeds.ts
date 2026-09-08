/**
 * 네이버 블로그 섹션(주제별 글 목록) 씨앗 창구 — 2026-09-09, 사장님 "독보적인 씨앗을 가져올 수 있는 곳".
 *
 * section.blog.naver.com 은 네이버가 쓰는 **바로 그 32주제 분류**로 지금 올라오는 글을 공개 API 로 준다
 * (DirectoryPostList.naver, 키 불필요, 한 페이지 10건, 주제당 1,000건까지). 검색광고(광고주 어휘)·뉴스(연예)
 * 에는 없는 생활·취미·예술 주제의 진짜 어휘가 여기 있다 — 실측(2026-09-09): 미술·사진·취미·원예는 창고에
 * 황금이 0이었다.
 *
 * 길은 힌트 창구와 같다: 제목 → 머리말(구절) → hintKeywords 로 검색량 실측 → 500 이상만 `section:주제` 로.
 * 제목은 씨앗이 아니다 — 검색량이 실측된 말만 씨앗이다.
 */

/** 주제 라벨 → 섹션 directorySeq. 2026-09-09 32개 전부 실측(각 주제 글 제목으로 대조). */
export const BLOG_SECTION_DIRECTORY: Readonly<Record<string, number>> = Object.freeze({
  '문학·책': 5, '영화': 6, '미술·디자인': 8, '공연·전시': 7, '음악': 11, '드라마': 9, '스타·연예인': 12,
  '만화·애니': 13, '방송': 10, '일상·생각': 14, '육아·결혼': 15, '반려동물': 16, '좋은글·이미지': 17,
  '패션·미용': 18, '인테리어·DIY': 19, '요리·레시피': 20, '상품리뷰': 21, '원예·재배': 36, '게임': 22,
  '스포츠': 23, '사진': 24, '자동차': 25, '취미': 26, '국내여행': 27, '세계여행': 28, '맛집': 29,
  'IT·컴퓨터': 30, '사회·정치': 31, '건강·의학': 32, '비즈니스·경제': 33, '어학·외국어': 35, '교육·학문': 34,
});

export const BLOG_SECTION_PAGE_SIZE = 10;

/** 쪽 넘김 인자는 `pageNo` 다 — 실측(2026-09-09): currentPage/page 는 무시돼 1쪽만 되풀이된다. */
export function blogSectionUrl(directorySeq: number, page: number): string {
  return `https://section.blog.naver.com/ajax/DirectoryPostList.naver?directorySeq=${directorySeq}&pageNo=${page}`;
}

/** 주제별 인기글(DirectoryTopPostList) — 섹션 화면 상단의 '인기' 묶음. 같은 모양으로 온다. */
export function blogSectionTopUrl(directorySeq: number): string {
  return `https://section.blog.naver.com/ajax/DirectoryTopPostList.naver?directorySeq=${directorySeq}`;
}

/** 창고 출처 꼬리표 — seed-db.topicOfSeed 가 읽는다. */
export function sectionSourceTag(topic: string): string {
  return `section:${topic}`;
}

function stripHtml(text: string): string {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 응답은 `)]}',` 접두사가 붙은 JSON 이다(실측). 제목만 돌려준다 — 실패하면 빈 배열. */
export function parseBlogSectionTitles(text: string): string[] {
  const body = String(text || '').replace(/^\)\]\}',?\s*/, '');
  let parsed: any;
  try { parsed = JSON.parse(body); } catch { return []; }
  const list = parsed && parsed.result && Array.isArray(parsed.result.postList) ? parsed.result.postList : [];
  const out: string[] = [];
  for (const post of list) {
    const title = stripHtml(post && post.title);
    if (title.length >= 2) out.push(title);
  }
  return out;
}

/*
 * 블로그 제목의 머리말 — 뉴스 제목(작품·인물 이름)과 달리 블로그는 "대구 가볼만한곳", "이유식 소고기",
 * "청년전용창업자금 대출" 같은 **구절**이 씨앗이다. 낱말 1개·이웃한 2개를 후보로 세고, 여러 제목에
 * 되풀이되는 것만 남긴다. 검색광고 hintKeywords 는 15자·공백 없음이라 그 안에서 자른다.
 */
const STOP_TOKENS = new Set([
  '추천', '후기', '리뷰', '정리', '총정리', '방법', '꿀팁', '팁', '정보', '이유', '지금', '오늘', '요즘', '진짜', '완전',
  '내돈내산', '솔직', '비교', '가격', '할인', '세일', '이벤트', '무료', '공유', '소개', '이야기', '일상', '기록', '모음',
  '그리고', '그래서', '하지만', '위한', '위해', '있는', '없는', '하는', '되는', '이런', '저런', '그런', '어떤', '너무',
  '정말', '많이', '조금', '다시', '먼저', '함께', '바로', '역시', '과연', '드디어', '역대급', '최고', '최신', '신상',
  '나의', '우리', '내가', '나는', '저는', '제가', '오늘의', '이번', '지난', '올해', '작년', '내년', '월', '일', '년',
  // 실측(2026-09-09, 사진·취미·원예·미술 400제목)에서 머리말로 떠오른 빈말 — 혼자서는 씨앗이 못 된다
  '좋은', '직접', '나만', '따라', '찍는', '심는', '그린', '잡기', '모양', '관리', '종류', '시기', '세계', '체험', '포인트',
]);
/** 지역 이름은 혼자 오면 여행 목록만 끌어온다(검색광고 호출 낭비) — 두 낱말 구절 안에서만 허용한다. */
const STOP_ALONE = new Set(['서울', '부산', '인천', '대구', '대전', '광주', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주', '수원', '성남', '고양', '용인', '창원', '홍대', '강남']);
const PARTICLE_TAIL = /(?:은|는|이|가|을|를|의|에|에서|으로|로|와|과|도|만|까지|부터|에게|께|처럼|보다|이랑|랑|이나|나)$/;

function cleanToken(raw: string): string {
  let token = raw
    .replace(/[^0-9A-Za-z가-힣·]/g, '')
    .replace(/^[·]+|[·]+$/g, '');
  if (!token) return '';
  if (/^\d+$/.test(token)) return '';
  if (/^\d+(?:월|일|년|세|살|개|번|호|기|화|회|주|시|분|초|명|원|만원|천원|평|kg|g|cm|m|인|박)$/.test(token)) return '';
  if (token.length >= 3 && /[가-힣]/.test(token)) {
    const bare = token.replace(PARTICLE_TAIL, '');
    if (bare.length >= 2) token = bare;
  }
  if (token.length < 2 || token.length > 15) return '';
  if (STOP_TOKENS.has(token)) return '';
  return token;
}

export interface SectionHeadOptions {
  minCount?: number;
  limit?: number;
  accept?: (head: string) => boolean;
}

export function extractSectionHeads(titles: readonly string[], options: SectionHeadOptions = {}): string[] {
  const minCount = Math.max(1, Math.floor(options.minCount ?? 2));
  const limit = Math.max(0, Math.floor(options.limit ?? 40));
  if (limit === 0) return [];
  const counts = new Map<string, number>();
  const seenTitles = new Set<string>();
  for (const raw of titles) {
    const title = stripHtml(raw);
    if (!title || seenTitles.has(title)) continue;
    seenTitles.add(title);
    // 블로그 제목의 구분자는 다양하다 — 전각 세로줄(｜)·가운뎃점(·)·대시(—–)·ㅣ 도 낱말 경계다.
    const tokens = title.split(/[\s,.!?~|｜·・—–ㅣ/()\[\]{}"'“”‘’:;#&+=<>]+/).map(cleanToken).filter(Boolean);
    const heads = new Set<string>();
    for (let i = 0; i < tokens.length; i += 1) {
      const one = tokens[i] as string;
      if (!STOP_ALONE.has(one)) heads.add(one);
      const next = tokens[i + 1];
      if (next) {
        const two = `${one} ${next}`;
        if (two.replace(/\s+/g, '').length <= 15) heads.add(two);
      }
    }
    for (const head of heads) counts.set(head, (counts.get(head) || 0) + 1);
  }
  const accept = options.accept || (() => true);
  return [...counts.entries()]
    .filter(([head, count]) => count >= minCount && accept(head))
    // 되풀이 많은 순, 같으면 긴 구절(더 구체적) 우선, 그다음 사전순 — 어느 회차나 같은 순서
    .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length) || a[0].localeCompare(b[0], 'ko'))
    .slice(0, limit)
    .map(([head]) => head);
}
