import { describe, expect, it } from 'vitest';
import { NAVER_BLOG_TOPIC_LABELS } from '../naver-blog-topics';
import { BIZTP_TOP_N } from '../seed-db';
import {
  HINT_ANCHORS,
  HINT_ROWS_CAP,
  SEED_HINTS,
  hintSourceTag,
  keepHintRow,
  preferSource,
  routeHintRow,
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
 * 닻 필터 — 첫 감사 실행(34165814111)이 드러낸 것.
 *
 * 힌트 연관어는 **광고주 그래프**다. 순위 꼬리가 아니라 2위부터 딴 밭이었다:
 *   드라마촬영지 → 촬영장소대여·로케이션섭외     방송편성표 → 지역케이블·IPTV비교
 *   피규어 → 레고테크닉·맥세이프충전기           미술관 → 경기도가볼만한곳·맥도날드
 *   아이돌굿즈 → 금속키링제작                     청년지원금 → 신용보증재단대출
 * 상한(HINT_ROWS_CAP)으로는 못 막는다. 그래서 행마다 그 주제의 말(닻)이 있어야
 * 담는다. 아래 예는 전부 그 감사 창고에서 실제로 나온 행이다 — 지어낸 것이 없다.
 */
describe('닻 필터 — 그 주제의 말이 있어야 담는다', () => {
  it('힌트 주제마다 닻이 있다', () => {
    for (const topic of Object.keys(SEED_HINTS)) {
      expect(HINT_ANCHORS[topic], `${topic} 닻이 없다`).toBeInstanceOf(RegExp);
    }
  });

  it('머리말은 반드시 제 주제의 닻을 통과한다 — 머리말 자신이 걸러지면 안 된다', () => {
    for (const [topic, heads] of Object.entries(SEED_HINTS)) {
      for (const head of heads) {
        expect(keepHintRow(topic, head), `${topic}/${head} 가 제 닻에 걸러진다`).toBe(true);
      }
    }
  });

  it('제 주제의 말이 있는 행은 남긴다', () => {
    const keep: Array<[string, string]> = [
      ['영화', '롯데시네마'], ['영화', '개봉예정영화'], ['영화', '메가박스할인'], ['영화', 'WAVVE'],
      ['드라마', '토일드라마'], ['드라마', '드라마촬영지'], ['드라마', '정주행드라마추천'],
      ['방송', '방송편성표'], ['방송', '예능다시보기'], ['방송', 'TVN예능'],
      ['스타·연예인', '아이돌오디션'], ['스타·연예인', '배우오디션'], ['스타·연예인', '아이돌굿즈샵'],
      ['음악', '트로트'], ['음악', '피아노악보'], ['음악', '성악가'], ['음악', '성인피아노학원'],
      ['만화·애니', '카카오웹툰'], ['만화·애니', '산리오'], ['만화·애니', '스케일피규어'],
      ['미술·디자인', '클립스튜디오'], ['미술·디자인', '그림전시'], ['미술·디자인', '일러스트공모전'],
      ['사진', '핫셀블라드'], ['사진', '여권사진'], ['사진', '셀프스튜디오'],
      ['좋은글·이미지', '무료폰트사이트'], ['좋은글·이미지', '특수문자'], ['좋은글·이미지', '생일축하메시지'],
      ['원예·재배', '안스리움'], ['원예·재배', '산세베리아'], ['원예·재배', '분재'], ['원예·재배', '개업화분'],
      ['게임', '롤전적검색OP'], ['게임', '팰월드'], ['게임', 'XBOXSERIESX'],
      // 서울전시회는 말 규칙(전시회)이 공연·전시로 보낸다 — 미술·디자인 아래에서 오면 안 담는다.
      ['공연·전시', '대학로연극'], ['공연·전시', '박람회'], ['공연·전시', '서울전시회'],
      ['사회·정치', '4대보험계산기'], ['사회·정치', '실업급여조건'], ['사회·정치', '상한제사후환급금'],
    ];
    for (const [topic, keyword] of keep) {
      expect(keepHintRow(topic, keyword), `${topic}/${keyword} 를 버렸다`).toBe(true);
    }
  });

  /*
   * 이 머리말 아래에는 안 담는다 — 딴 주제로 가거나(routeHintRow 가 정한다) 버려진다.
   * 사장님(2026-09-08) "광고주 그래프도 중요하지 않니": 상업 말이라서 버리지 않는다.
   * 그래서 가족사진보정업체(사진)·조경업체(원예)·대리티켓팅업체(공연)는 이제 제 머리말
   * 아래 남는다 — 자리는 SERP 가 잰다. 여기 목록에서 뺐다.
   */
  it('제 주제 말이 없는 행은 이 머리말 아래 안 담는다', () => {
    const drop: Array<[string, string]> = [
      ['드라마', '촬영장소대여'], ['드라마', '로케이션섭외'], ['드라마', '실시간TV보기'],
      ['방송', '지역케이블'], ['방송', 'IPTV비교'], ['방송', '픽업아티스트'], ['방송', '알뜰인터넷요금제'],
      ['스타·연예인', '금속키링제작'], ['스타·연예인', '댄스학원'], ['스타·연예인', '팝업스토어대관'],
      ['만화·애니', '맥세이프충전기'], ['만화·애니', '레고테크닉'], ['만화·애니', '수영'],
      ['미술·디자인', '맥도날드'], ['미술·디자인', '빽다방'], ['미술·디자인', '국민취업지원제도'], ['미술·디자인', '경기도가볼만한곳'],
      ['사진', '누끼따기사이트'],
      ['좋은글·이미지', '한자사전'], ['좋은글·이미지', '이북리더기'], ['좋은글·이미지', '케이크토퍼'],
      ['원예·재배', '집들이선물'],
      ['영화', 'YOUTUBE'], ['영화', '넷플릭스요금제'], ['영화', '웹하드'],
      ['사회·정치', '청년창업대출'], ['사회·정치', '인턴'], ['사회·정치', '구인구직사이트'],
      ['공연·전시', '브런치카페'],
    ];
    for (const [topic, keyword] of drop) {
      expect(keepHintRow(topic, keyword), `${topic}/${keyword} 를 남겼다`).toBe(false);
    }
  });

  it('상업 말이라도 제 주제 말이 있으면 남긴다 — 자리는 SERP 가 잰다', () => {
    expect(keepHintRow('사진', '가족사진보정업체')).toBe(true);
    expect(keepHintRow('원예·재배', '조경업체')).toBe(true);
    expect(keepHintRow('공연·전시', '대리티켓팅업체')).toBe(true);
  });

  /*
   * 한글은 낱말 경계가 없다. '배우'를 닻으로 두면 기타'배우'기(기타 배우기)가
   * 스타·연예인으로 간다 — 감사 창고에서 실제로 그렇게 걸렸다. 닻은 합성어로 적는다.
   */
  it('부분일치로 딴 밭을 담지 않는다', () => {
    expect(keepHintRow('스타·연예인', '기타배우기')).toBe(false);
    expect(keepHintRow('스타·연예인', '북콘서트')).toBe(false);
  });

  /*
   * 말 규칙이 이미 주제를 정한 행은 그 판정을 따른다. 뮤지컬은 공연·전시 규칙에
   * 걸리므로 스타·연예인 머리말 아래에서 와도 담지 않고(공연·전시 머리말이 담는다),
   * 발로란트는 게임 규칙에 걸리므로 만화·애니 아래에서는 버린다. 반대로 규칙이
   * **이 주제**로 보내는 행은 닻이 없어도 남긴다 — 이터널리턴·장려금·팬미팅.
   */
  it('말 규칙의 판정이 닻보다 앞선다', () => {
    expect(keepHintRow('스타·연예인', '뮤지컬')).toBe(false);
    expect(keepHintRow('미술·디자인', '서울전시회')).toBe(false);
    expect(keepHintRow('만화·애니', '발로란트')).toBe(false);
    expect(keepHintRow('공연·전시', '9월축제')).toBe(false);
    expect(keepHintRow('게임', '이터널리턴')).toBe(true);
    expect(keepHintRow('사회·정치', '청년일자리도약장려금')).toBe(true);
    expect(keepHintRow('공연·전시', '팬미팅')).toBe(true);
  });

  it('불법 복제·성인물은 어느 주제든 버린다', () => {
    expect(keepHintRow('영화', '무료영화보기사이트')).toBe(false);
    expect(keepHintRow('영화', 'AV영화')).toBe(false);
    expect(keepHintRow('드라마', '일드다운')).toBe(false);
    expect(keepHintRow('만화·애니', '애니무료사이트')).toBe(false);
    // 폰트 내려받기는 정당하다 — 매체 복제만 막는다.
    expect(keepHintRow('좋은글·이미지', '폰트다운')).toBe(true);
  });

  it('닻이 없는 주제는 아무것도 담지 않는다', () => {
    expect(keepHintRow('없는주제', '아무말')).toBe(false);
  });
});

/*
 * 되보내기(2026-09-08, 사장님 "광고주 그래프도 중요하지 않니, 광고 수익으로 먹고사는 게
 * 블로거인데"). 첫 감사에서 닻에 안 맞는 920행을 버렸는데 548행은 창고에서 아예
 * 사라졌다 — 넷플릭스요금제 73,000 · IRP계좌 37,780 · 중드추천 33,270 은 글이 되고
 * 광고도 붙는 말이다. 이제 버리지 않고 **말이 가리키는 주제로** 보낸다.
 * 순서: 거부어 → 말 규칙 → 제 머리말의 닻 → 다른 주제의 닻 → 없으면 버림.
 */
describe('되보내기 — 닻에 안 맞는 행은 버리지 않고 제 주제로', () => {
  it('제 주제 말이 있으면 머리말 주제 그대로다', () => {
    expect(routeHintRow('영화', '롯데시네마')).toBe('영화');
    expect(routeHintRow('원예·재배', '안스리움')).toBe('원예·재배');
  });

  it('다른 주제의 닻이 맞으면 그 주제로 보낸다 — 첫 감사에서 사라졌던 행들', () => {
    expect(routeHintRow('영화', '중드추천')).toBe('드라마');
    expect(routeHintRow('영화', '일일드라마')).toBe('드라마');
    expect(routeHintRow('드라마', '촬영장소대여')).toBe('사진');
    expect(routeHintRow('사회·정치', '국민취업지원제도')).toBe('사회·정치');
  });

  it('말 규칙이 정한 주제가 닻보다 앞이다 — 상업 말은 제 주제로', () => {
    expect(routeHintRow('사회·정치', 'IRP계좌')).toBe('비즈니스·경제');
    expect(routeHintRow('사회·정치', '청년창업대출')).toBe('비즈니스·경제');
    expect(routeHintRow('사회·정치', '인턴')).toBe('비즈니스·경제');
    expect(routeHintRow('영화', '넷플릭스요금제')).toBe('IT·컴퓨터');
    expect(routeHintRow('영화', '유튜브프리미엄가격')).toBe('IT·컴퓨터');
    expect(routeHintRow('방송', 'IPTV비교')).toBe('IT·컴퓨터');
    expect(routeHintRow('미술·디자인', '맥도날드')).toBe('맛집');
    expect(routeHintRow('미술·디자인', '경기도가볼만한곳')).toBe('국내여행');
    expect(routeHintRow('공연·전시', '오사카가볼만한곳')).toBe('세계여행');
    expect(routeHintRow('스타·연예인', '뮤지컬')).toBe('공연·전시');
  });

  it('어디에도 안 맞으면 버린다', () => {
    for (const [topic, keyword] of [
      ['만화·애니', '수영'], ['만화·애니', '레고테크닉'], ['방송', '지역케이블'], ['방송', '픽업아티스트'],
      ['스타·연예인', '댄스학원'], ['스타·연예인', '금속키링제작'], ['좋은글·이미지', '한자사전'],
    ] as Array<[string, string]>) {
      expect(routeHintRow(topic, keyword), `${topic}/${keyword} 가 어딘가로 갔다`).toBeNull();
    }
  });

  it('거부어는 어디로도 안 보낸다 — B2B 조달어·성인·불법복제만', () => {
    for (const [topic, keyword] of [
      ['드라마', '로케이션섭외'], ['스타·연예인', '팝업스토어대관'], ['스타·연예인', '행사용역'],
      ['영화', '웹하드'], ['영화', 'AV영화'], ['드라마', '일드다운'],
    ] as Array<[string, string]>) {
      expect(routeHintRow(topic, keyword), `${topic}/${keyword} 가 어딘가로 갔다`).toBeNull();
    }
  });

  /*
   * 되보내기는 닻을 남의 행에도 대므로 부분일치 위험이 커진다. 창고 45,366개에서
   * 실제로 있는 말들이다 — 한 글자 낱말을 닻으로 두면 전부 딴 밭으로 간다.
   */
  it('부분일치로 딴 주제에 보내지 않는다', () => {
    expect(routeHintRow('사회·정치', '기타소득')).not.toBe('음악');
    expect(routeHintRow('원예·재배', '나무위키')).not.toBe('원예·재배');
    expect(routeHintRow('게임', '전기스위치')).not.toBe('게임');
    expect(routeHintRow('공연·전시', 'KTX예매')).not.toBe('공연·전시');
    expect(routeHintRow('좋은글·이미지', '신용카드추천')).toBe('비즈니스·경제');
    expect(routeHintRow('사회·정치', '공학용계산기')).not.toBe('사회·정치');
    expect(routeHintRow('영화', '쿠키레시피')).not.toBe('영화');
    expect(routeHintRow('방송', '컴퓨터프로그램')).not.toBe('방송');
    expect(routeHintRow('만화·애니', '캐릭터케이크')).not.toBe('만화·애니');
    expect(routeHintRow('음악', '비트코인')).not.toBe('음악');
    expect(routeHintRow('음악', '멜론')).not.toBe('음악');
    expect(routeHintRow('영화', '파리채')).not.toBe('세계여행');
    expect(routeHintRow('원예·재배', '홍콩야자')).toBe('원예·재배');
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
