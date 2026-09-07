/**
 * 계절 씨앗 — 해마다 같은 달에 검색이 터지는 말.
 *
 * 왜 따로 두나(사장님 2026-09-07 "검색량이 폭발적이면서 상위노출이 되어야 의미가
 * 있다" · "이런 키워드가 최대한 대량으로 있어야 메리트가 있어"):
 *   기존 씨앗(blog-topic-coverage)은 '방법·후기·노하우' 같은 상시 어휘라 계절성이
 *   0이다. 거기서 연관어를 아무리 넓혀도 '주민세 납부기간'처럼 8월에 30배가 되는
 *   말은 안 나온다. 실측(2026-09-07): 계절 씨앗 10개를 지금 파이프라인에 그대로
 *   넣으니 고유 후보 846 · 검색량 3,000↑ 118 · 10,000↑ 52 이 나왔다. 씨앗 하나가
 *   3,000↑ 를 평균 12개 낸다.
 *
 * 폭발한 뒤에는 늦다 — 검색량 1만↑ 9행 전부 상위 10개가 1~3주 전 정면 글이었다.
 * 그래서 **피크 1~4개월 전**에만 씨앗을 켠다. 지금 쓰면 그 사이 글이 숙성되고
 * 피크 때 자리를 잡는다. 이게 이 보드의 이름(선점)이 뜻하는 것이다.
 *
 * 규칙(blog-topic-coverage 의 씨앗 규칙과 같다):
 *   ① 사람이 실제로 치는 말만. 조합해서 만들지 않는다.
 *   ② 검색광고 hintKeywords 15자 제한(공백 제외).
 *   ③ 주제 라벨은 naver-blog-topics 와 정확히 같아야 한다 — 실행 시점에 대조한다.
 *   ④ peak 는 검색이 **가장 많은 달**(1~12). 두 번 터지면 둘 다 적는다.
 *
 * 여기 값은 화면에 나가지 않는다 — 어디를 팔지 정하는 출발점일 뿐이고, 나오는
 * 후보는 전부 검색량·문서수·시계열·SERP 실측을 거친다.
 */
import { NAVER_BLOG_TOPICS } from './naver-blog-topics';

export interface SeasonalSeed {
  /** 씨앗어. 공백 제외 15자 이하. */
  term: string;
  /** 검색이 가장 많은 달(1~12). 두 번 터지면 둘 다. */
  peak: number[];
}

export const SEASONAL_SEEDS: Record<string, SeasonalSeed[]> = {
  '사회·정치': [
    { term: '연말정산 간소화', peak: [1] },
    { term: '연말정산 환급금', peak: [2] },
    { term: '자동차세 연납 할인', peak: [1] },
    { term: '종합소득세 신고', peak: [5] },
    { term: '종합소득세 환급', peak: [6] },
    { term: '근로장려금 신청', peak: [3, 5, 9] },
    { term: '재산세 납부', peak: [7, 9] },
    { term: '주민세 납부', peak: [8] },
    { term: '부가세 신고', peak: [1, 7] },
    { term: '종부세 납부', peak: [12] },
    { term: '건강보험료 정산', peak: [4] },
    { term: '국민연금 인상', peak: [1] },
    { term: '최저임금', peak: [1, 7] },
    { term: '청년도약계좌', peak: [1] },
    { term: '에너지바우처', peak: [5, 10] },
    { term: '난방비 지원', peak: [11, 12] },
    { term: '전기요금 인상', peak: [7] },
    { term: '실업급여 인상', peak: [1] },
    { term: '국가장학금 신청', peak: [5, 11] },
    { term: '예비군 훈련 일정', peak: [3] },
    { term: '공무원 봉급 인상', peak: [1] },
    { term: '노인일자리 모집', peak: [12] },
    { term: '기초연금 인상', peak: [1] },
    { term: '명절 지원금', peak: [1, 9] },
  ],
  '비즈니스·경제': [
    { term: '연말정산 계산기', peak: [1] },
    { term: '부가세 예정신고', peak: [4, 10] },
    { term: '종합소득세 신고 방법', peak: [5] },
    { term: '법인세 신고', peak: [3] },
    { term: '성과급', peak: [1, 2] },
    { term: '연봉 인상률', peak: [1] },
    { term: '블랙프라이데이', peak: [11] },
    { term: '광군제', peak: [11] },
    { term: '추석 상여금', peak: [9] },
    { term: '설 상여금', peak: [1] },
    { term: 'IRP 세액공제 한도', peak: [12] },
    { term: '배당금 지급일', peak: [4] },
    { term: '주주총회', peak: [3] },
    { term: '소상공인 지원금 신청', peak: [1, 2] },
    { term: '소상공인 지식배움터', peak: [1] },
    { term: '코리아세일페스타', peak: [11] },
    { term: '4대보험 정산', peak: [4] },
    { term: '연차수당 정산', peak: [12, 1] },
    { term: '법인 결산', peak: [12] },
    { term: '상반기 공채', peak: [3] },
    { term: '하반기 공채', peak: [9] },
  ],
  '일상·생각': [
    { term: '추석 선물세트', peak: [8, 9] },
    { term: '추석 인사말', peak: [9] },
    { term: '설 선물세트', peak: [1] },
    { term: '설날 인사말', peak: [1] },
    { term: '새해 인사말', peak: [12, 1] },
    { term: '크리스마스 선물 추천', peak: [11, 12] },
    { term: '크리스마스 케이크 예약', peak: [12] },
    { term: '김장 시기', peak: [11] },
    { term: '김장 배추 가격', peak: [11] },
    { term: '김장 김치 보관', peak: [11, 12] },
    { term: '어버이날 선물', peak: [4, 5] },
    { term: '스승의날 선물', peak: [5] },
    { term: '발렌타인데이 선물', peak: [2] },
    { term: '화이트데이 선물', peak: [3] },
    { term: '빼빼로데이', peak: [11] },
    { term: '핼러윈 의상', peak: [10] },
    { term: '장마철 제습', peak: [6] },
    { term: '폭염 대비', peak: [7] },
    { term: '한파 대비', peak: [12, 1] },
    { term: '겨울 난방비 절약', peak: [11, 12] },
    { term: '여름 전기요금 절약', peak: [7] },
    { term: '새해 목표', peak: [1] },
    { term: '봄맞이 대청소', peak: [3] },
    { term: '수능 도시락', peak: [11] },
    { term: '송년회 장소', peak: [12] },
    { term: '복날 음식', peak: [7] },
    { term: '동지 팥죽', peak: [12] },
    { term: '정월대보름 음식', peak: [2] },
    { term: '추석 차례상', peak: [9] },
    { term: '설 차례상', peak: [1] },
    { term: '벌초 시기', peak: [8] },
    { term: '전기장판', peak: [11] },
    { term: '가습기', peak: [11, 12] },
    { term: '에어컨 청소', peak: [5, 6] },
    { term: '제습기', peak: [6] },
    { term: '모기 퇴치', peak: [7] },
  ],
  '자동차': [
    { term: '자동차세 연납', peak: [1] },
    { term: '자동차세 납부', peak: [6, 12] },
    { term: '전기차 보조금', peak: [1, 2] },
    { term: '전기차 보조금 신청', peak: [2] },
    { term: '겨울 타이어 교체', peak: [11] },
    { term: '스노우체인', peak: [12] },
    { term: '부동액 교체', peak: [11] },
    { term: '겨울 배터리 방전 예방', peak: [12] },
    { term: '에어컨 필터 교체', peak: [5, 6] },
    { term: '장마철 와이퍼 교체', peak: [6] },
    { term: '장마철 타이어', peak: [6] },
    { term: '여름 자동차 관리', peak: [7] },
    { term: '추석 귀성길 정체', peak: [9] },
    { term: '설 귀성길', peak: [1] },
    { term: '고속도로 통행료 면제', peak: [1, 9] },
    { term: '블랙박스 여름 배터리', peak: [7] },
    { term: '눈길 운전', peak: [12, 1] },
    { term: '블랙아이스', peak: [12, 1] },
    { term: '신차 출시 일정', peak: [1] },
    { term: '차량 햇빛가리개', peak: [6, 7] },
    { term: '겨울 워셔액', peak: [11] },
    { term: '차량 김서림', peak: [11, 12] },
    { term: '휴가철 렌트카', peak: [7] },
    { term: '황사 세차', peak: [3] },
  ],
  '건강·의학': [
    { term: '독감 예방접종 시기', peak: [9, 10] },
    { term: '독감 예방접종 무료 대상', peak: [9, 10] },
    { term: '독감 증상', peak: [12, 1] },
    { term: '환절기 감기', peak: [3, 9] },
    { term: '알레르기 비염', peak: [3, 4, 9] },
    { term: '꽃가루 알레르기', peak: [4] },
    { term: '황사 마스크', peak: [3] },
    { term: '미세먼지 마스크', peak: [3, 12] },
    { term: '수족구 증상', peak: [6] },
    { term: '식중독 예방', peak: [7, 8] },
    { term: '온열질환', peak: [7] },
    { term: '열사병 증상', peak: [7] },
    { term: '냉방병', peak: [7] },
    { term: '국가건강검진', peak: [10, 11, 12] },
    { term: '건강검진 예약', peak: [11, 12] },
    { term: '노로바이러스', peak: [11, 12, 1] },
    { term: '겨울 피부 건조', peak: [11, 12] },
    { term: '자외선 차단제', peak: [5, 6] },
    { term: '여름 다이어트', peak: [5] },
    { term: '새해 다이어트', peak: [1] },
    { term: '금연 클리닉', peak: [1] },
    { term: '연말 숙취', peak: [12] },
    { term: '야생진드기', peak: [9] },
    { term: '유행성 결막염', peak: [8] },
    { term: '겨울 우울증', peak: [12] },
    { term: '감기 독감 차이', peak: [12] },
    { term: '폐렴구균', peak: [10] },
    { term: '춘곤증', peak: [3, 4] },
    { term: '가을 탈모', peak: [9, 10] },
  ],
  '국내여행': [
    { term: '벚꽃 명소', peak: [3, 4] },
    { term: '벚꽃 개화시기', peak: [3] },
    { term: '벚꽃 축제', peak: [3, 4] },
    { term: '유채꽃', peak: [3, 4] },
    { term: '튤립 축제', peak: [4] },
    { term: '장미 축제', peak: [5] },
    { term: '5월 연휴 여행', peak: [4, 5] },
    { term: '여름휴가 국내', peak: [7] },
    { term: '워터파크', peak: [7] },
    { term: '계곡 물놀이', peak: [7, 8] },
    { term: '추석 연휴 여행', peak: [9] },
    { term: '추석 연휴 갈만한 곳', peak: [9] },
    { term: '코스모스 명소', peak: [9, 10] },
    { term: '단풍 명소', peak: [10] },
    { term: '단풍 시기', peak: [10] },
    { term: '핑크뮬리', peak: [10] },
    { term: '억새 축제', peak: [10] },
    { term: '은행나무 명소', peak: [10, 11] },
    { term: '불꽃축제', peak: [10] },
    { term: '스키장 개장', peak: [11, 12] },
    { term: '눈꽃축제', peak: [1] },
    { term: '빙어축제', peak: [1] },
    { term: '겨울 온천', peak: [12, 1] },
    { term: '해맞이 명소', peak: [12] },
    { term: '일출 명소', peak: [12, 1] },
    { term: '크리스마스 여행', peak: [12] },
    { term: '설 연휴 여행', peak: [1] },
    { term: '딸기 농장 체험', peak: [1, 2, 3] },
    { term: '사과 따기 체험', peak: [10] },
    { term: '가을 캠핑', peak: [9, 10] },
    { term: '겨울 캠핑', peak: [12] },
    { term: '봄 나들이', peak: [3, 4] },
    { term: '가을 나들이', peak: [10] },
    { term: '매화 명소', peak: [2, 3] },
    { term: '동백꽃 명소', peak: [1, 2] },
    { term: '겨울 바다', peak: [12, 1] },
    { term: '눈 오는 여행지', peak: [12, 1] },
    { term: '여름 휴가지 추천', peak: [6, 7] },
  ],
  '육아·결혼': [
    { term: '어린이날 선물', peak: [4, 5] },
    { term: '아이 크리스마스 선물', peak: [12] },
    { term: '유치원 입학 준비', peak: [2] },
    { term: '유치원 입학 신청', peak: [11] },
    { term: '어린이집 입소 대기', peak: [1] },
    { term: '초등 입학 준비물', peak: [1, 2] },
    { term: '신학기 준비물', peak: [2, 3] },
    { term: '학용품 준비', peak: [2] },
    { term: '여름방학 계획', peak: [7] },
    { term: '겨울방학 계획', peak: [12] },
    { term: '방학 특강', peak: [7, 12] },
    { term: '소아 독감 예방접종', peak: [9] },
    { term: '아동수당', peak: [1] },
    { term: '부모급여', peak: [1] },
    { term: '첫만남 이용권', peak: [1] },
    { term: '육아휴직 급여 인상', peak: [1] },
    { term: '가을 결혼식', peak: [9] },
    { term: '봄 결혼식', peak: [4] },
    { term: '웨딩 촬영 시기', peak: [3, 10] },
    { term: '신혼여행 추천', peak: [4, 10] },
    { term: '어린이 물놀이', peak: [7] },
    { term: '운동회 도시락', peak: [5, 10] },
    { term: '소풍 도시락', peak: [5, 10] },
    { term: '수능 선물', peak: [11] },
    { term: '졸업 선물', peak: [2] },
    { term: '입학 선물', peak: [2, 3] },
    { term: '어린이날 나들이', peak: [5] },
    { term: '겨울 아이 실내놀이', peak: [12, 1] },
    { term: '겨울방학 학원', peak: [12] },
    { term: '아이 독감', peak: [12, 1] },
    { term: '아이 자외선 차단', peak: [6] },
  ],
  // 아래는 지금 CI 레인(ACTIVE_TOPICS) 밖이다. 레인이 열리는 날 바로 쓰이도록 표는 채워 둔다.
  '교육·학문': [
    { term: '수능', peak: [11] },
    { term: '수능 디데이', peak: [10, 11] },
    { term: '수능 원서접수', peak: [8, 9] },
    { term: '수능 시간표', peak: [11] },
    { term: '수능 등급컷', peak: [11, 12] },
    { term: '9월 모의고사', peak: [9] },
    { term: '6월 모의고사', peak: [6] },
    { term: '수시 원서접수', peak: [9] },
    { term: '정시 원서접수', peak: [12, 1] },
    { term: '공무원 시험 일정', peak: [1, 2, 6] },
    { term: '토익 시험 일정', peak: [1] },
    { term: '대학 등록금', peak: [2, 8] },
  ],
  'IT·컴퓨터': [
    { term: '블랙프라이데이 노트북', peak: [11] },
    { term: '신학기 노트북', peak: [2] },
    { term: '애플 신제품', peak: [9] },
    { term: '갤럭시 신제품', peak: [1, 7] },
  ],
  '패션·미용': [
    { term: '여름 선크림', peak: [5] },
    { term: '겨울 패딩', peak: [11] },
    { term: '롱패딩', peak: [11] },
    { term: '수영복', peak: [6] },
    { term: '봄 코트', peak: [3] },
  ],
  '스포츠': [
    { term: '마라톤 대회', peak: [3, 10] },
    { term: '프로야구 개막', peak: [3] },
    { term: '한국시리즈', peak: [10] },
  ],
  /*
   * 공연·전시(레인 개설 2026-09-07). 공연은 계절을 크게 탄다 — 연말 공연이 12월에
   * 몰리고, 여름 페스티벌은 7~8월이다. 상시 씨앗(티켓팅 실패·시야제한석)은 연중
   * 같은 자리를 파므로 시기 축은 여기서 채운다.
   */
  '공연·전시': [
    { term: '연말 공연', peak: [12] },
    { term: '크리스마스 공연', peak: [12] },
    { term: '호두까기인형', peak: [12] },
    { term: '제야음악회', peak: [12] },
    { term: '신년음악회', peak: [1] },
    { term: '어린이날 공연', peak: [4, 5] },
    { term: '어린이 뮤지컬', peak: [5] },
    { term: '여름 페스티벌', peak: [7, 8] },
    { term: '록페스티벌', peak: [7, 8] },
    { term: '재즈페스티벌', peak: [9, 10] },
    { term: '가을 전시회', peak: [9, 10] },
    { term: '아트페어', peak: [9, 10] },
    { term: '대학 축제 라인업', peak: [5, 9] },
    { term: '내한공연 일정', peak: [3, 10] },
  ],
  '요리·레시피': [
    { term: '김장 레시피', peak: [11] },
    { term: '추석 음식', peak: [9] },
    { term: '설 음식', peak: [1] },
    { term: '삼계탕', peak: [7] },
    { term: '팥빙수', peak: [7] },
    { term: '송편', peak: [9] },
    { term: '떡국', peak: [1] },
  ],
};

/** 지금 달(1~12)에서 피크 달까지 몇 달 남았나. 같은 달이면 0, 지난 달이면 11. */
export function monthsAhead(peakMonth: number, nowMonth: number): number {
  return ((peakMonth - nowMonth) % 12 + 12) % 12;
}

export interface SeasonalWindow {
  /** 피크까지 최소 몇 달 남아야 켜나. 기본 1 — 같은 달이면 이미 늦다. */
  leadMin?: number;
  /** 피크까지 최대 몇 달. 기본 4 — 그보다 멀면 아직 이르다. */
  leadMax?: number;
  /** 주제당 최대 몇 개. 씨앗 하나가 검색광고 1회 + 자동완성 수십 회를 부르므로 상한을 둔다. */
  limit?: number;
}

/**
 * 이 달에 켤 계절 씨앗. 피크가 가까운 순으로 돌려준다.
 *
 * 모르는 주제면 빈 배열 — 여기서 던지면 회차 전체가 죽는다(조용한 0건보다는
 * 나쁘다). 주제 라벨 오타는 seasonalSeedProblems 가 따로 잡는다.
 */
export function seasonalSeedsForTopic(
  topic: string,
  now: Date = new Date(),
  window: SeasonalWindow = {},
): string[] {
  const leadMin = window.leadMin ?? 1;
  const leadMax = window.leadMax ?? 4;
  const limit = window.limit ?? 10;
  const nowMonth = now.getMonth() + 1;
  const seeds = SEASONAL_SEEDS[topic] || [];
  return seeds
    .map((seed) => {
      /*
       * 피크가 여럿이면 **창 안에 든 것** 중 가장 가까운 달로 잰다.
       * 가장 가까운 피크만 보면 틀린다 — '독감 예방접종 시기'(9·10월)는 9월에
       * 9월 피크가 0개월(늦음)이지만 10월 피크가 1개월 앞이라 켜야 맞다.
       * 테스트가 잡아낸 결함(2026-09-07).
       */
      const inWindow = seed.peak
        .map((m) => monthsAhead(m, nowMonth))
        .filter((ahead) => ahead >= leadMin && ahead <= leadMax);
      return { term: seed.term, ahead: inWindow.length > 0 ? Math.min(...inWindow) : null };
    })
    .filter((seed): seed is { term: string; ahead: number } => seed.ahead !== null)
    .sort((a, b) => a.ahead - b.ahead)
    .slice(0, limit)
    .map((seed) => seed.term);
}

/** 표의 결함. 비어 있으면 정상. 실행 시점과 테스트에서 둘 다 부른다. */
export function seasonalSeedProblems(): string[] {
  const labels = new Set(NAVER_BLOG_TOPICS.map((t) => t.label));
  const problems: string[] = [];
  for (const [topic, seeds] of Object.entries(SEASONAL_SEEDS)) {
    if (!labels.has(topic)) problems.push(`주제 라벨 없음: ${topic}`);
    const seen = new Set<string>();
    for (const seed of seeds) {
      const compact = seed.term.replace(/\s+/g, '');
      if (compact.length > 15) problems.push(`${topic}/${seed.term} — 15자 초과(${compact.length})`);
      if (compact.length === 0) problems.push(`${topic} — 빈 씨앗`);
      if (seen.has(compact)) problems.push(`${topic}/${seed.term} — 중복`);
      seen.add(compact);
      if (seed.peak.length === 0) problems.push(`${topic}/${seed.term} — 피크 달 없음`);
      for (const m of seed.peak) {
        if (!Number.isInteger(m) || m < 1 || m > 12) problems.push(`${topic}/${seed.term} — 달 범위 밖(${m})`);
      }
    }
  }
  return problems;
}
