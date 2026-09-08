/**
 * 뉴스 제목에서 작품·프로그램·인물 이름을 뽑는다(2026-09-08).
 *
 * 왜(사장님 "정직하게 남는 것들을 최대한 극한으로 늘려봐"): 방송 15 · 스타·연예인 19 ·
 * 드라마 35 — 검색광고 연관어는 광고주 그래프라 이 세 주제엔 콘텐츠 이웃이 없다.
 * 머리말을 광고 어휘가 아니라 **지금 방영 중인 작품·인물**로 바꿔야 하는데, 손으로
 * 적으면 일주일이면 낡는다. 연예 뉴스 제목은 작품명을 따옴표로 감싼다
 * ('폭싹 속았수다' 아이유 · ‘나혼자산다’ 기안84) — 따옴표 안 말과 "배우 ○○·가수 ○○"
 * 뒤 이름을 뽑으면 창고를 다시 긁을 때마다(월·금) 이름도 같이 갱신된다.
 *
 * 순수 함수. 네트워크 없음. 세는 법: 후보(따옴표 안 말·역할 뒤 이름)를 모은 뒤
 * **그 말을 품은 제목이 몇 개인지** 센다 — 같은 작품이 따옴표 없이 다시 나와도 센다.
 * 작품명이 이름보다 앞이다: 작품 머리말은 출연진·몇부작·결말 같은 시청자 말을 끌고
 * 오지만 이름 머리말은 나이·프로필(카드 답, 죽은 말)을 끌고 온다.
 */

export interface TitleHeadOptions {
  /** 이 수 이상의 제목에 나온 말만 쓴다. 기본 2 — 한 번짜리 따옴표는 강조가 대부분이다. */
  minCount?: number;
  /** 최대 개수. 검색광고 호출 한 번이 머리말 하나다. */
  limit?: number;
}

/** 여는 따옴표 → 닫는 따옴표. 대괄호는 [단독]·[포토] 꼬리표라 뺀다. */
const QUOTE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["'", "'"], ['‘', '’'], ['"', '"'], ['“', '”'], ['「', '」'], ['『', '』'], ['《', '》'], ['〈', '〉'],
];

/** 역할말 뒤에 오는 이름 — "배우 송강", "가수 아이유가". */
const ROLE_NAME = /(?:배우|가수|아이돌|방송인|개그맨|개그우먼|코미디언|MC|아나운서|래퍼|트로트가수|모델|작가|감독)\s+([가-힣A-Za-z0-9]{2,8})/g;

/** 이름 끝에 붙은 조사. 떼고도 두 글자 이상 남을 때만 뗀다(유이 → 유 가 되면 안 된다). */
const TRAILING_PARTICLE = /(?:이랑|에게|에서|께서|이|가|은|는|의|와|과|도|를|을|에|랑)$/;

/*
 * 머리말이 못 되는 말. 기사 꼬리표·강조어·일반명사. 따옴표로 자주 감싸이지만
 * 작품이 아니다 — '충격' 세 번 나와도 머리말이 아니다.
 */
const STOP_HEADS = new Set([
  '단독', '종합', '속보', '포토', '영상', '인터뷰', '공식', '현장', '화보', '전문', '1보', '2보', '스타포토',
  'TV', 'N', '충격', '경악', '눈물', '깜짝', '파격', '논란', '사과', '입장', '근황', '결혼', '열애', '이혼',
  '사망', '별세', '응원', '감사', '기대', '축하', '화제', '폭소', '감동', '소름', '반전', '최초', '공개', '종영',
  '첫방', '시청률', '하차', '복귀', '컴백', '데뷔', '기자', '뉴스', '드라마', '영화', '예능', '배우', '가수',
  '아이돌', '신곡', '앨범', '무대', '출연', '방송', '라디오', '팬', '팬들', '시즌', '특집',
]);

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** API 가 섞어 주는 엔티티·태그를 벗긴다. 이중 인코딩(&lt;b&gt;)도 한 번 더 벗긴다. */
function cleanTitle(raw: string): string {
  const decode = (s: string) => s
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');
  return stripTags(decode(stripTags(decode(String(raw || ''))))).replace(/\s+/g, ' ').trim();
}

/** 공백을 지우고 앞뒤 부호를 떼어 머리말 꼴로 만든다. 못 쓰는 말이면 null. */
function toHead(span: string): string | null {
  const compact = String(span || '')
    .replace(/^[\s!?.…~♥♡,·:;\-–—]+|[\s!?.…~♥♡,·:;\-–—]+$/g, '')
    .replace(/\s+/g, '');
  if (compact.length < 2 || compact.length > 15) return null;
  if (!/^[가-힣A-Za-z0-9]+$/.test(compact)) return null;
  if (STOP_HEADS.has(compact)) return null;
  return compact;
}

function stripParticle(name: string): string {
  const stripped = name.replace(TRAILING_PARTICLE, '');
  return stripped.length >= 2 ? stripped : name;
}

export function extractTitleHeads(titles: readonly string[], options: TitleHeadOptions = {}): string[] {
  const minCount = Math.max(1, Math.floor(options.minCount ?? 2));
  const limit = Math.max(0, Math.floor(options.limit ?? 30));
  // 같은 기사가 여러 질의에 겹쳐 온다('드라마'와 '드라마 시청률'은 거의 같은 기사를 준다).
  // 그대로 세면 한 번 따옴표에 든 강조어가 기사 수만큼 불어 머리말이 된다 — 제목을 한 번만 센다.
  const cleaned = [...new Set((Array.isArray(titles) ? titles : []).map(cleanTitle).filter(Boolean))];
  if (cleaned.length === 0 || limit === 0) return [];

  /** 후보 → { 종류(작품 0·이름 1), 처음 본 자리 } */
  const candidates = new Map<string, { kind: number; order: number }>();
  const remember = (head: string | null, kind: number) => {
    if (!head) return;
    const seen = candidates.get(head);
    if (!seen) candidates.set(head, { kind, order: candidates.size });
    else if (kind < seen.kind) candidates.set(head, { kind, order: seen.order });
  };

  for (const title of cleaned) {
    for (const [open, close] of QUOTE_PAIRS) {
      const pattern = new RegExp(`${escapeRegExp(open)}([^${escapeRegExp(open)}${escapeRegExp(close)}]{2,24})${escapeRegExp(close)}`, 'g');
      for (const match of title.matchAll(pattern)) remember(toHead(match[1]), 0);
    }
    for (const match of title.matchAll(ROLE_NAME)) remember(toHead(stripParticle(match[1])), 1);
  }
  if (candidates.size === 0) return [];

  // 품은 제목 수로 센다 — 따옴표 없이 다시 나와도 같은 작품이다.
  const compactTitles = cleaned.map((title) => title.replace(/\s+/g, ''));
  const counted = [...candidates.entries()]
    .map(([head, meta]) => ({
      head,
      kind: meta.kind,
      order: meta.order,
      count: compactTitles.filter((title) => title.includes(head)).length,
    }))
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => a.kind - b.kind || b.count - a.count || a.order - b.order);

  return counted.slice(0, limit).map((entry) => entry.head);
}
