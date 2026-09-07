/**
 * 힌트 창구 — 창고에서 0개 받던 주제의 공급원(2026-09-08).
 *
 * 왜: 32주제 첫 회차 뒤 창고 44,344개를 주제별로 세어 보니 **열 주제가 0개**였다.
 *   영화 · 드라마 · 방송 · 스타·연예인 · 음악 · 만화·애니 · 미술·디자인 · 사진 ·
 *   좋은글·이미지 · 원예·재배
 * 창고를 다 뒤져도 없었다. 없어서가 아니라 검색광고 업종 창구(biztpId)가
 * **광고주용**이라 연예·문화 콘텐츠가 애초에 안 실리기 때문이다. 이 주제들은
 * 상시 씨앗 7~11개로만 돌았고, 영화는 그래서 씨앗 12개 → 후보 12건에 그쳤다
 * (문학·책은 창고 12개가 연관어를 486개로 불려 후보를 냈다).
 *
 * 같은 API 의 hintKeywords 는 머리말을 주면 연관어를 1,000개까지 준다(검색량 포함).
 * 주제마다 머리말 몇 개를 넣어 긁고, 출처를 `hint:주제` 로 남긴다. 그러면 seed-db 가
 * **출처로** 라우팅한다 — 말(정규식)로 잡으면 수'원신'축아파트 같은 부분일치
 * 오탐이 따라오지만, 출처는 그 위험이 없다.
 *
 * 머리말 고르기 규칙:
 *   · 15자 이하 · 공백 없음 — hintKeywords 가 잘라서 **다른 말의** 연관어를 조용히 준다
 *   · 그 주제 사람만 치는 말 — '카메라추천'은 블랙박스·CCTV 가 딸려 와서
 *     '미러리스카메라'로, '화분'은 근조화환·개업화분이 딸려 와서 '화분추천'으로 적었다
 *   · 이미 말 규칙이 딴 주제로 보내는 말은 피한다 — '팬미팅'은 공연·전시 규칙에 걸린다
 */

/**
 * 머리말 하나당 쓰는 연관어 상한.
 *
 * 업종 창구는 51위부터 딴 밭이 섞였다(biztp:15 금시세 → 양말·골프웨어). 그래서
 * 업종은 상위 300 만 쓴다(BIZTP_TOP_N). 힌트 연관어 꼬리도 같은 병이 있을 텐데
 * 로컬엔 검색광고 키가 없어 살아 있는 감사 없이 여는 창구라, 그보다 좁게 시작한다.
 * build-seed-db 가 순위 구간 표본을 로그에 남기므로, 첫 회차 로그를 보고 조정한다.
 */
export const HINT_ROWS_CAP = 200;

/** 주제 → 머리말. 주제 이름은 naver-blog-topics 의 라벨 그대로다(테스트가 대조한다). */
export const SEED_HINTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '영화': ['영화추천', '넷플릭스영화추천', '개봉영화', '영화순위', '영화관할인', '재개봉영화'],
  '드라마': ['드라마추천', '넷플릭스드라마', '드라마순위', '드라마촬영지', '드라마다시보기', '드라마결말'],
  '방송': ['예능추천', '방송편성표', '예능프로그램', '방청신청', '시청률순위', '라디오사연'],
  '스타·연예인': ['아이돌', '연예인', '팬사인회', '아이돌굿즈', '연예인근황', '아이돌데뷔'],
  '음악': ['노래추천', '음악추천', '악보', '음원차트', '보컬레슨', '기타레슨'],
  '만화·애니': ['웹툰추천', '애니추천', '만화책추천', '피규어', '애니메이션추천', '웹툰순위'],
  '미술·디자인': ['미술관', '그림그리기', '아이패드드로잉', '디자인포트폴리오', '미술전시회', '색연필추천'],
  '사진': ['미러리스카메라', '사진보정', '사진관', '라이트룸', '카메라렌즈추천', '인물사진'],
  '좋은글·이미지': ['좋은글귀', '명언', '캘리그라피', '무료폰트', '감사인사말', '생일축하문구'],
  '원예·재배': ['실내식물', '다육이', '텃밭', '몬스테라', '식물키우기', '화분추천'],
  // 아래 셋은 창고가 있긴 한데 얇다(게임 81 · 공연·전시 83 · 사회·정치 59).
  '게임': ['게임추천', '모바일게임순위', 'PC게임순위', '닌텐도스위치', '스팀게임', '콘솔게임'],
  '공연·전시': ['뮤지컬추천', '콘서트', '전시회추천', '연극추천', '콘서트티켓', '뮤지컬예매'],
  '사회·정치': ['정부지원금', '청년지원금', '복지혜택', '실업급여', '국민연금', '기초연금'],
});

/** 창고에 남기는 출처 꼬리표. seed-db.topicOfSeed 가 이 접두사를 읽는다. */
export function hintSourceTag(topic: string): string {
  return `hint:${topic}`;
}

/*
 * 같은 말이 여러 창구에서 오면 어느 출처를 남기나.
 *
 * 창고를 세어 보니 업종 창구 행 84,882개 중 21,899개가 먼저 긁은 월·시즌 창구에
 * 가려져 출처를 잃었다. 월·시즌 출처는 주제가 없어 라우팅이 안 되므로, 그 말이
 * 업종에서도 왔다는 사실이 통째로 버려진 것이다. 주제를 아는 출처가 이겨야 한다.
 *   hint  3  주제를 직접 가리킨다
 *   biztp 2  업종 매핑으로 주제를 안다
 *   month/event 1  주제가 없다(말 규칙에만 기댄다)
 * 같은 급이면 먼저 만난 것을 남긴다 — 옛 동작 그대로라 기존 창고와 어긋나지 않는다.
 */
const SOURCE_RANK: Readonly<Record<string, number>> = Object.freeze({ hint: 3, biztp: 2, month: 1, event: 1 });

function rankOf(tag: string): number {
  const prefix = tag.split(':')[0];
  return SOURCE_RANK[prefix] ?? 0;
}

export function preferSource(previous: string | undefined, next: string | undefined): string {
  const prev = String(previous || '');
  const nxt = String(next || '');
  if (!prev) return nxt;
  if (!nxt) return prev;
  return rankOf(nxt) > rankOf(prev) ? nxt : prev;
}

export interface WarehouseLike {
  builtAt?: string;
  sources?: Record<string, unknown>;
}

/**
 * 창고를 다시 긁어야 하나.
 *   · 3일(월·금 갱신)이 넘었으면 다시
 *   · 힌트 창구가 없는 옛 꼴이면 **신선해도** 다시 — 힌트를 연 날 레포 창고는
 *     하루 전 것이라, 날짜만 보면 건너뛰고 열 주제가 다음 회차까지 또 0개다
 *   · 없거나 날짜가 깨졌으면 다시
 */
export function warehouseNeedsRebuild(
  previous: WarehouseLike | null | undefined,
  options: { maxAgeDays: number; now?: Date },
): boolean {
  if (!previous || typeof previous !== 'object') return true;
  const builtAt = Date.parse(String(previous.builtAt || ''));
  if (!Number.isFinite(builtAt)) return true;
  const now = options.now ?? new Date();
  const ageDays = (now.getTime() - builtAt) / 86400000;
  if (ageDays >= options.maxAgeDays) return true;
  const sources = previous.sources;
  if (!sources || typeof sources !== 'object' || !('hint' in sources)) return true;
  return false;
}
