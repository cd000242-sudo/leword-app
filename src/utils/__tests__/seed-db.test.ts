import { describe, it, expect } from 'vitest';
import { BIZTP_TOPIC, pickSeeds, roundFromDate, seedDbAgeDays, topicOfSeed, type SeedDb } from '../seed-db';

const db = (count: number): SeedDb => ({
  builtAt: new Date().toISOString(),
  totalSeeds: count,
  // 검색량이 서로 다르게 — 정렬이 실제로 먹는지 보려고 역순으로 넣는다.
  seeds: Array.from({ length: count }, (_, i) => ({ keyword: `말${i}`, searchVolume: (i + 1) * 100 })),
});

describe('pickSeeds', () => {
  it('검색량 하한 아래는 뺀다', () => {
    const picked = pickSeeds(db(10), { limit: 100, minVolume: 500 });
    // 100,200,…,1000 중 500 이상 = 6개
    expect(picked).toHaveLength(6);
    expect(picked).not.toContain('말0');
  });

  it('이미 쓰는 씨앗은 공백을 지워 비교해 뺀다', () => {
    const picked = pickSeeds(db(5), { limit: 100, minVolume: 0, exclude: ['말 4', '말3'] });
    expect(picked).not.toContain('말4');
    expect(picked).not.toContain('말3');
    expect(picked).toHaveLength(3);
  });

  it('검색량 큰 것부터 판다', () => {
    expect(pickSeeds(db(5), { limit: 2, minVolume: 0, round: 0 })).toEqual(['말4', '말3']);
  });

  it('회차마다 다른 구간을 판다 — 앞쪽만 반복해서 파지 않는다', () => {
    const first = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 0 });
    const second = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 1 });
    const third = pickSeeds(db(100), { limit: 10, minVolume: 0, round: 2 });
    expect(first).not.toEqual(second);
    expect(second).not.toEqual(third);
    // 겹치지 않는다 — 창이 정확히 limit 만큼 밀린다
    expect(first.filter((k) => second.includes(k))).toHaveLength(0);
  });

  it('같은 회차 번호면 같은 결과다 — 재현된다(난수 아님)', () => {
    expect(pickSeeds(db(100), { limit: 7, minVolume: 0, round: 42 }))
      .toEqual(pickSeeds(db(100), { limit: 7, minVolume: 0, round: 42 }));
  });

  it('창이 끝에 닿으면 앞으로 돌아온다 — 요청한 개수를 항상 채운다', () => {
    const picked = pickSeeds(db(10), { limit: 8, minVolume: 0, round: 1 });
    expect(picked).toHaveLength(8);
    expect(new Set(picked).size).toBe(8); // 한 회차 안에서 중복 없음
  });

  it('창고가 없거나 비었으면 빈 배열 — 회차를 죽이지 않는다', () => {
    expect(pickSeeds(null, { limit: 10, minVolume: 0 })).toEqual([]);
    expect(pickSeeds({ builtAt: '', totalSeeds: 0, seeds: [] }, { limit: 10, minVolume: 0 })).toEqual([]);
  });

  it('하한을 넘는 씨앗이 없으면 빈 배열', () => {
    expect(pickSeeds(db(3), { limit: 10, minVolume: 999999 })).toEqual([]);
  });
});

describe('seedDbAgeDays', () => {
  it('며칠 됐는지 잰다 — 월·금 갱신이라 3일이 문턱이다', () => {
    const now = new Date('2026-09-07T00:00:00Z');
    const four = { builtAt: '2026-09-03T00:00:00Z', totalSeeds: 0, seeds: [] };
    expect(seedDbAgeDays(four, now)).toBeCloseTo(4, 5);
    expect(seedDbAgeDays(null, now)).toBeNull();
    expect(seedDbAgeDays({ builtAt: '깨진값', totalSeeds: 0, seeds: [] }, now)).toBeNull();
  });
});

describe('topicOfSeed — 말이 먼저, 업종이 다음', () => {
  it('지원금 계열은 업종이 무엇이든 사회·정치다 — 여덟 업종에 흩어져 있던 것들', () => {
    // 실측: 소상공인지원금=마케팅업종, 청년주택=부동산업종, 서울시청년수당=3월
    expect(topicOfSeed({ keyword: '소상공인지원금', searchVolume: 50210, source: 'biztp:18' })).toBe('사회·정치');
    expect(topicOfSeed({ keyword: '근로장려금신청방법', searchVolume: 10180, source: 'biztp:24' })).toBe('사회·정치');
    expect(topicOfSeed({ keyword: '평생교육바우처', searchVolume: 16680, source: 'biztp:4' })).toBe('사회·정치');
    expect(topicOfSeed({ keyword: '청년임대주택', searchVolume: 18400, source: 'biztp:9' })).toBe('사회·정치');
    // 월·시즌 출처라 업종 매핑이 아예 없는 것도 말로 잡힌다
    expect(topicOfSeed({ keyword: '서울시청년수당', searchVolume: 6430, source: 'month:3' })).toBe('사회·정치');
  });

  it('축제는 국내여행, 공연은 공연·전시 — 출처가 월·시즌이어도 잡는다', () => {
    // 실측: 여의도불꽃축제 962,700(10월) · 봉평메밀꽃축제(9월) · 거창감악산축제(event:49)
    expect(topicOfSeed({ keyword: '여의도불꽃축제', searchVolume: 962700, source: 'month:10' })).toBe('국내여행');
    expect(topicOfSeed({ keyword: '거창감악산축제', searchVolume: 49120, source: 'event:49' })).toBe('국내여행');
    // 공연은 별개 주제 — 예매·좌석으로 찾는 말이라 나들이와 섞지 않는다
    expect(topicOfSeed({ keyword: '드라큘라뮤지컬', searchVolume: 79900, source: 'biztp:56' })).toBe('공연·전시');
    expect(topicOfSeed({ keyword: '대학로연극', searchVolume: 97600, source: 'biztp:8' })).toBe('공연·전시');
  });

  /*
   * 발로란트는 2026-09-07 에 이 목록에서 뺐다 — 게임 레인을 열었기 때문이다.
   * 그때까지 게임 말이 갈 곳이 없던 이유는 biztp:8 을 오염으로 매핑에서 뺀 탓이지
   * 게임을 안 파려던 것이 아니다. 실제로 32주제 첫 회차에서 게임만 후보 0건이 나왔다.
   * 아래 '게임 레인' 블록이 그 자리를 잇는다.
   *
   * 투어·티켓·웹툰은 그대로 둔다 — 이건 진짜로 딴 밭이 딸려 오던 말들이다.
   */
  it('투어·티켓·웹툰은 안 잡는다 — 딴 밭이 딸려 오던 말들', () => {
    for (const keyword of ['부산요트투어', '고속버스표예매', '신작웹툰']) {
      expect(topicOfSeed({ keyword, searchVolume: 5000, source: 'biztp:8' })).toBeNull();
    }
  });

  it('말에 안 걸리면 업종 매핑을 쓴다', () => {
    expect(topicOfSeed({ keyword: '제네시스G90중고', searchVolume: 1000, source: 'biztp:17' })).toBe('자동차');
    expect(topicOfSeed({ keyword: '산후조리원가격', searchVolume: 1000, source: 'biztp:37' })).toBe('육아·결혼');
  });

  it('매핑에서 뺀 업종과 월·시즌 출처는 null — 주제를 고른 발굴에서 안 쓴다', () => {
    // 15(금시세→옷), 10·62(산업 자재), 50(레저·수예 혼재) 은 뺐다
    for (const source of ['biztp:15', 'biztp:10', 'biztp:62', 'biztp:50', 'month:11', 'event:23']) {
      expect(topicOfSeed({ keyword: '아무말', searchVolume: 1000, source })).toBeNull();
    }
    expect(topicOfSeed({ keyword: '아무말', searchVolume: 1000 })).toBeNull();
  });

  it('오염으로 뺀 업종이 매핑에 되살아나 있지 않다', () => {
    for (const id of ['1', '15', '34', '49', '75', '10', '62', '50', '11', '65', '67']) {
      expect(BIZTP_TOPIC[id]).toBeUndefined();
    }
  });
});

/**
 * 게임 레인을 말로 연다(2026-09-07).
 *
 * 왜: 32주제 첫 회차에서 **게임만 후보 0건**이었다(로그 "후보 0건 주제 1종: 게임").
 * 씨앗이 8개뿐이라 자동완성이 60구절밖에 못 만들었고 수요통과가 2건이었다.
 * 창고에는 게임 씨앗이 있는데 — 리니지M 238,800 · 피파4 202,400 ·
 * 발로란트 154,000 — 업종 코드가 게임에 매핑돼 있지 않아 통째로 놀았다.
 *
 * 업종을 통째로 매핑할 수는 없다. 실측으로 확인했다:
 *   biztp:53  피파4·로스트아크와 웹툰·무료폰트·악보가 섞여 있다
 *   biztp:8   뮤지컬·연극·전시와 발로란트·PC게임랭킹이 섞여 있다
 * 그래서 업종이 아니라 **말**로 건져 온다 — 기존 사회·정치/공연·전시와 같은 방식이다.
 */
describe('게임 레인 — 말로 씨앗 건지기', () => {
  const asGame = (keyword: string) => topicOfSeed({ keyword, searchVolume: 1000, source: 'biztp:8' });

  it('게임 고유명사를 게임으로 보낸다', () => {
    for (const keyword of [
      '리니지M', '피파4', '발로란트', '로스트아크', '배틀그라운드',
      '이터널리턴', '나이트크로우', '메이플스토리M', '쿠키런킹덤',
      '닌텐도동물의숲', '마크서버', '롤랭크',
    ]) {
      expect(asGame(keyword), `${keyword} 가 게임으로 안 간다`).toBe('게임');
    }
  });

  it('게임 합성어도 게임으로 보낸다', () => {
    for (const keyword of ['게임순위', 'PC게임랭킹', '온라인게임순위', '스팀게임', '모바일게임사전예약']) {
      expect(asGame(keyword), `${keyword} 가 게임으로 안 간다`).toBe('게임');
    }
  });

  /*
   * 여기가 이 블록의 핵심이다. 한글은 낱말 경계가 없어서 부분일치 사고가 난다.
   * 창고 44,344개를 훑어 실제로 걸린 것만 적었다 — 지어낸 예가 아니다:
   *   원신(게임)  → 수'원신'축아파트 · 경비'원신'임교육   (창고의 원신 매치는 전부 이것뿐)
   *   메이플(게임) → '메이플'자이(아파트) · '메이플'CC(골프장)
   * 예전에 '수당' 규칙이 연차수당을 사회·정치로 끌어간 것과 같은 종류다.
   */
  it('부분일치 오탐을 게임으로 끌고 가지 않는다', () => {
    for (const keyword of [
      '수원신축아파트', '수원신축빌라', '경비원신임교육', '일반경비원신임교육',
      '메이플자이', '반포메이플자이', '메이플CC',
    ]) {
      expect(asGame(keyword), `${keyword} 가 게임으로 잘못 갔다`).not.toBe('게임');
    }
  });

  it('공연·전시 씨앗이 게임 규칙에 안 끌려간다', () => {
    // biztp:8 은 뮤지컬·연극과 게임이 섞인 업종이라, 규칙이 넓으면 공연이 통째로 끌려간다.
    for (const keyword of ['뮤지컬', '대학로연극', '서울전시회', '코엑스전시회']) {
      expect(asGame(keyword)).not.toBe('게임');
    }
  });
});

/**
 * 힌트 출처(2026-09-08). build-seed-db 가 hintKeywords 로 긁은 씨앗은 `hint:주제`
 * 출처를 달고 온다 — 창고에서 0개 받던 영화·드라마·방송·연예 주제의 공급원이다.
 * 말이 아니라 출처로 라우팅하므로 부분일치 오탐이 없다.
 */
describe('topicOfSeed — 힌트 출처', () => {
  it('hint:주제 출처는 그 주제로 간다', () => {
    expect(topicOfSeed({ keyword: '넷플릭스영화추천', searchVolume: 1000, source: 'hint:영화' })).toBe('영화');
    expect(topicOfSeed({ keyword: '아이돌포토카드', searchVolume: 1000, source: 'hint:스타·연예인' })).toBe('스타·연예인');
  });

  it('말 규칙이 힌트보다 먼저다 — 지원금은 어느 창구에서 왔든 사회·정치', () => {
    expect(topicOfSeed({ keyword: '영화제작지원금', searchVolume: 1000, source: 'hint:영화' })).toBe('사회·정치');
  });

  it('라벨이 빈 힌트는 null', () => {
    expect(topicOfSeed({ keyword: '아무말', searchVolume: 1000, source: 'hint:' })).toBeNull();
  });

  it('힌트 출처 씨앗을 주제로 고를 수 있다 — 업종 순위 상한에 걸리지 않는다', () => {
    const store = {
      builtAt: '2026-09-08T00:00:00Z',
      totalSeeds: 2,
      seeds: [
        { keyword: '넷플릭스영화추천', searchVolume: 5000, source: 'hint:영화' },
        { keyword: '삼성전자주가', searchVolume: 9000, source: 'biztp:5' },
      ],
    };
    expect(pickSeeds(store, { limit: 10, minVolume: 500, topic: '영화' })).toEqual(['넷플릭스영화추천']);
    expect(pickSeeds(store, { limit: 10, minVolume: 500, topic: '비즈니스·경제' })).toEqual(['삼성전자주가']);
  });
});

/*
 * 상업 말 규칙(2026-09-08). 창고 45,366개 중 22,239개가 주제 없이 놀고 있었고 그 안에
 * 렌탈·설치 525 · 학원 166 · 통신 88 · 금융 58 이 있었다. 사장님: "광고 수익으로 먹고사는
 * 게 블로거인데" — 상업 말이라서 버리지 않는다. 말이 가리키는 주제로 보낸다.
 * 규칙은 배열 순서가 곧 우선순위다: 세계여행이 국내여행보다 앞(오사카가볼만한곳),
 * 반려동물·자동차가 부동산·금융보다 앞(강아지분양·중고차매매).
 */
describe('topicOfSeed — 상업 말 규칙', () => {
  const of = (keyword: string) => topicOfSeed({ keyword, searchVolume: 1000, source: 'month:5' });

  it('금융·취업·부동산은 비즈니스·경제', () => {
    for (const k of ['청년창업대출', 'IRP계좌개설', '연금저축펀드', '신용카드추천', '재테크', '40대알바', '구인구직사이트', '인턴', '아파트분양', '전세대출']) {
      expect(of(k), k).toBe('비즈니스·경제');
    }
  });

  it('통신·디지털은 IT·컴퓨터', () => {
    for (const k of ['넷플릭스요금제', '알뜰폰요금제', 'IPTV비교', '유튜브프리미엄가격', 'YOUTUBE', '갤럭시S25', '엑셀단축키']) {
      expect(of(k), k).toBe('IT·컴퓨터');
    }
  });

  it('나들이 말은 국내여행, 해외 지명이면 세계여행', () => {
    for (const k of ['경기도가볼만한곳', '서울놀거리', '당일치기여행', '호캉스']) expect(of(k), k).toBe('국내여행');
    for (const k of ['오사카가볼만한곳', '도쿄여행', '방콕호텔', '항공권특가']) expect(of(k), k).toBe('세계여행');
  });

  it('외식 브랜드·카페는 맛집, 생활 서비스는 일상·생각', () => {
    for (const k of ['맥도날드', '빽다방', '브런치카페', '맛집추천']) expect(of(k), k).toBe('맛집');
    for (const k of ['에어컨청소', '입주청소', '정수기렌탈', '포장이사비용']) expect(of(k), k).toBe('일상·생각');
  });

  it('반려동물·자동차·어학·교육 — 부동산·금융 규칙에 빼앗기지 않는다', () => {
    expect(of('강아지분양')).toBe('반려동물');
    expect(of('중고차매매')).toBe('자동차');
    expect(of('토익공부법')).toBe('어학·외국어');
    expect(of('공무원시험일정')).toBe('교육·학문');
  });

  it('기존 규칙이 먼저다 — 지원금·축제·게임', () => {
    expect(of('창업지원금')).toBe('사회·정치');
    expect(of('부산불꽃축제')).toBe('국내여행');
    expect(of('스팀게임할인')).toBe('게임');
  });

  it('부분일치 함정 — 창고에 실제로 있는 말', () => {
    expect(of('파리채')).not.toBe('세계여행');
    expect(of('세부사항')).not.toBe('세계여행');
    expect(of('대만족')).not.toBe('세계여행');
    expect(of('홍콩야자')).not.toBe('세계여행');
    expect(of('카펫')).not.toBe('반려동물');
    expect(of('전세버스')).not.toBe('비즈니스·경제');
    expect(of('크롬도금')).not.toBe('IT·컴퓨터');
    expect(of('윈도우필름')).not.toBe('IT·컴퓨터');
    expect(of('부산요트투어')).toBeNull();
    expect(of('고속버스표예매')).toBeNull();
    // 창고 감사(2026-09-08)에서 실제로 잘못 잡혔던 넷
    expect(of('스타벅스주가')).not.toBe('맛집');
    expect(of('대형카페트')).not.toBe('맛집');
    expect(of('엑셀세라퓨틱스')).not.toBe('IT·컴퓨터');
    expect(of('수능도시락')).not.toBe('교육·학문');
  });

  it('감사에서 갈 곳 없이 버려지던 말들 — 검색량이 있는데 주제가 없었다', () => {
    expect(of('집들이선물')).toBe('상품리뷰');
    expect(of('베스트셀러순위')).toBe('문학·책');
    expect(of('서울근교나들이')).toBe('국내여행');
    expect(of('성수팝업스토어')).toBe('국내여행');
    expect(of('맥세이프충전기')).toBe('IT·컴퓨터');
    expect(of('평생교육원')).toBe('교육·학문');
  });
});

describe('roundFromDate', () => {
  it('같은 날은 같은 회차 번호', () => {
    expect(roundFromDate(new Date(2026, 8, 7, 3))).toBe(roundFromDate(new Date(2026, 8, 7, 20)));
    expect(roundFromDate(new Date(2026, 8, 7))).not.toBe(roundFromDate(new Date(2026, 8, 8)));
  });
});

/*
 * 건강·의학·스포츠 말 규칙(2026-09-08, 네 번째 감사). 연예 기사에 따옴표로 든 병명이 방송에,
 * 영화 '오디세이' 머리말이 끌고 온 '오디세이퍼터'가 스타·연예인에 실렸다. 말이 가리키는
 * 주제로 보낸다. 반려동물이 먼저다 — 강아지피부염·강아지수영장은 반려동물이다.
 */
describe('topicOfSeed — 건강·의학·스포츠 말 규칙', () => {
  const of = (keyword: string) => topicOfSeed({ keyword, searchVolume: 1000, source: 'month:5' });

  it('병명·증상·치료는 건강·의학', () => {
    for (const k of ['미주신경기능저하', '과민성대장증후군', '무릎통증치료법', '어깨수술비용', '영양제추천']) expect(of(k), k).toBe('건강·의학');
  });

  it('운동·구기·장비는 스포츠', () => {
    for (const k of ['오디세이퍼터', '골프레슨', '테니스라켓추천', '헬스장추천', '마라톤대회']) expect(of(k), k).toBe('스포츠');
  });

  it('반려동물이 먼저다', () => {
    expect(of('강아지피부염')).toBe('반려동물');
    expect(of('강아지수영장')).toBe('반려동물');
  });

  it('부분일치 함정 — 재활용·동물병원·캠핑장추천', () => {
    expect(of('재활용')).not.toBe('건강·의학');
    expect(of('동물병원')).not.toBe('건강·의학');
    expect(of('캠핑장추천')).toBe('국내여행');
  });

    it('블로그 섹션 출처(section:주제)는 그 주제로 간다 — 말 규칙이 먼저다(2026-09-09)', () => {
        expect(topicOfSeed({ keyword: '배롱나무길', searchVolume: 900, source: 'section:국내여행' })).toBe('국내여행');
        expect(topicOfSeed({ keyword: '드로잉패드', searchVolume: 900, source: 'section:미술·디자인' })).toBe('미술·디자인');
        expect(topicOfSeed({ keyword: '아무말', searchVolume: 900, source: 'section:' })).toBeNull();
    });
});
