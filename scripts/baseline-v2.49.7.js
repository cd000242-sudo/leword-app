/**
 * baseline-v2.49.7.js — LEWORD v2.49.7 baseline measurement
 *
 * 측정:
 *   1. 100 시드 × 3 dc 시나리오 → calculateGrade (rich-feed-builder) sanity gate 작동률
 *   2. 100 시드 × 8 suffix → classifySeedDomain + expandWithIntentSuffixes 어색 결합 비율
 *   3. classifier 오분류 + cache schema impact
 *
 * 사용:
 *   node scripts/baseline-v2.49.7.js
 */

const path = require('path');
const fs = require('fs');

// ---------- 시드 풀 (100개, 도메인 균등) ----------
const SEEDS = {
  commerce: [
    '마우스', '노트북', '에어컨', '향수', '가방', '무선청소기 추천', '다이슨 v15',
    '게이밍 노트북 추천', '아이폰 15 케이스', '갤럭시 S24', '에어팟 프로 2',
    '제습기 추천', '선풍기 추천', '맥북 에어 M3', '키보드 추천',
    '커피머신 추천', '안마의자 추천', '캠핑 의자 추천', '운동화 추천',
    '백팩 추천', '시계 추천', '향수 추천', '선글라스 추천', '청바지 추천',
    '코트 추천', '패딩 추천', '롱부츠 추천', '귀걸이 추천', '목걸이 추천',
    '지갑 추천',
  ],
  admin: [
    '환급금 조회 토스', '근로장려금 신청', '종소세 환급', '청년월세지원금',
    '연말정산 환급', '국민연금 추납', '실업급여 신청', '건강보험 환급',
    '자녀장려금 신청', '청년도약계좌 신청', '청년희망적금', '소득공제 항목',
    '의료비 공제', '교육비 공제', '주민등록 등본', '인감 증명서',
    '4대보험 환급', '취득세 신고', '재산세 조회', '종합소득세 신고',
  ],
  food: [
    '송편', '떡국', '김장 김치', '발렌타인 초콜릿',
    '냉면 만드는법', '아이스크림 만드는법', '팥죽 만드는법', '잡채 만드는법',
    '갈비찜 레시피', '김치찌개 레시피', '비빔밥 레시피', '떡볶이 레시피',
    '김장 양념 레시피', '송편 만드는법', '여름 음식 레시피',
  ],
  travel: [
    '제주도 여행', '벚꽃 명소', '가을 단풍',
    '제주도 여행 코스', '동해 여행', '남해 여행', '여름휴가 국내',
    '봄 캠핑장', '가을 캠핑장', '겨울 캠핑장',
    '단풍 명소', '벚꽃 개화 시기', '봄나들이 명소',
    '워터파크 추천', '계곡 추천',
  ],
  person: [
    '패리스 잭슨', '유관순', '안중근',
    '이순신', '세종대왕', '김구', '윤봉길', '안창호', '김유신', '장동건',
  ],
  issue: [
    '단오', '호국보훈의 달', '어린이날',
    '광복절 의미', '한글날 의미', '식목일 의미', '현충일 의미',
    '3.1절', '독립운동가', '제헌절',
  ],
};

const ALL_SEEDS = [];
for (const [dom, list] of Object.entries(SEEDS)) {
  for (const s of list) ALL_SEEDS.push({ seed: s, expectedDomain: dom });
}

// ---------- rich-feed-builder.ts 핵심 게이트 미러링 ----------
// (소스에서 그대로 복제 — exports 안 된 internal function 직접 호출 불가)

const STOP = new Set(['오늘','지금','진짜','완전','정말','바로','그냥','이거','저거','있다','없다','대문','한국','대한민국','서울','관련','특집','뉴스','소개','공개','발표','시작','종료','오늘의','이번','지난','최근','계속','다음','먼저','나중']);

const INTENT_SUFFIX_RE = /(추천|후기|비교|방법|순위|종류|가격|리뷰|만드는법|만들기|하는법|사용법|뜻|차이|장단점|원인|증상|효과|부작용|쓰는법|설치법|가입|해지|환불)$/;
const COMMERCIAL_RE = /(추천|비교|후기|가격|순위|할인|최저가|리뷰|원데이|무료|가성비|베스트|인기|신상|브랜드|구매)/;

const KOREAN_SURNAMES = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민유진지엄채원방공현함변염여추도석선설마길연위표명기반나왕금옥육인맹제모탁국어육';
const CELEB_PATTERN_RE = new RegExp(`^[${KOREAN_SURNAMES}][가-힣]{1,3}$`);
function isLikelyCelebrityName(keyword) {
  const clean = keyword.trim();
  if (clean.length < 2 || clean.length > 4) return false;
  if (clean.includes(' ')) return false;
  return CELEB_PATTERN_RE.test(clean);
}

const GENERIC_BROAD_RE = /^(적금|예금|카드|대출|보험|투자|주식|펀드|ETF|연금|세금|건강|영양제|비타민|음식|요리|청소|여행|맛집|공부|운동|헬스|다이어트|뷰티|화장품|샴푸|선크림|의류|패션|가구|인테리어|네이버|구글|카카오|삼성|엘지|쿠팡|클로드|챗GPT|유튜브|인스타|페이스북|브랜드|제품|상품|서비스|리뷰|일본|미국|중국|한국|영국|독일|프랑스|이탈리아|러시아|인도|호주|캐나다|스페인|태국|베트남|유럽|아시아|동남아|북미|남미|중동|서울|부산|대구|인천|제주|강남|홍대|이태원|명동|성수|경기|강원|충청|전라|경상|국내|국외|해외|반려동물|돼지고기|소고기|닭고기|생선|아파트|빌라|오피스텔|주식종류|레고|정부|로마|청약|영화|드라마|음악|게임|애니|웹툰|소설|방송|예능|공연|뉴스|사건|사고|이슈|사람|인물|기업|회사|단체|기관|학교|대학|학원|은행|금융|경제|사회|정치|스포츠|선수|팀|경기|시합|대회|올림픽|월드컵|IT|AI|로봇|우주|과학|기술|발명|연구|교육|입시|시험|공무원|자격증|취업|직장|연봉|면접|국민연금|아동수당|근로장려금|자녀장려금|청년도약계좌|청년희망적금|기초연금|실업급여|재난지원금|건강보험|고용보험|산재보험|4대보험|사대보험|청년수당|국민행복카드|취업지원센터|건강보험공단|국민연금공단|농협금융|청약홈|정부24|홈택스|협력|대상|사정|병용|산산조각|리브스|호르무즈|우베|자위행위|절반|일부|전부|종합|일반|보통|평균|비율|수준|결과|가능|불가|필수|차이|이유|장점|단점|특징|특성|기능|효율|효과)$/;
const GENERIC_VAGUE_ACTION_RE = /^(추천|후기|리뷰|비교|순위|가격|방법|꿀팁|정리|할인|세일|이벤트|인기|베스트|신상|최신|tips|모음|목록|소개|설명|정보|뜻|의미|브랜드|종류|안내|공지)$/i;
const GENERIC_PROCESS_ACTION_RE = /^(신청|해지|환불|가입|취소|결제|구매|판매|반품|교환|반납|연장|예약|배송|발급|승인|승급|등록|탈퇴|로그인|로그아웃|회원|업데이트|다운로드|설치|제거|삭제|초기화|변경|수정|이전|이체|입금|출금|적립|충전|충전금|증명|발행|발송|수신|전송|확인서|증명서|영수증|계산|계산법|환산)$/i;
const GENERIC_ACTION_RE = new RegExp(`${GENERIC_VAGUE_ACTION_RE.source.slice(1,-1)}|${GENERIC_PROCESS_ACTION_RE.source.slice(1,-1)}`, 'i');
const NEWS_NOISE_RE = /^(분기|폐지|종류|세계|개최|사망|협상|발표|공개|선언|입장|대응|가능성|전망|예정|인터뷰|논란|제기|의혹|해명|공지|답변|반응|이슈|속보|긴급|비상|충격|폭로|고백|루머|소문|공방|격돌|대결|파장|파문|후폭풍|여파|보도|특종|거부|결렬|철회|취소|승인|기각|제출|접수|공시|공표|해제|연장|중단|재개|해임|사임|지명|임명|승진|퇴임|방문|순방|귀국|출국|도착|출발|회담|회의|총회|위원회|처분|결정|검토|합의|체결|조사|수사|기소|판결|선고|결과|최종|잠정|추가|수정|확정|변경|조정|전달|언급|경고|강조|지적|주장|반박|반대|찬성|동의|거절|요구|요청|제안|건의|권고|충고|촉구|호소|지지|비판|우려|기대|환영|축하|위로|애도|분노|공분|여론|민심|표심|속설|미담)$/;
function isNewsNoise(keyword) {
  const clean = keyword.trim();
  if (clean.includes(' ')) return false;
  return NEWS_NOISE_RE.test(clean);
}
const POLYSEMY_RE = /^(시각|통화|세대|필름|상인|콜라보|캠페인|시사|피해|시간|시점|관점|입장|상황|환경|구조|조건|기준|대상|방송|진행|운영|개시|상태|상승|상승세|하락|하락세|시각화|시간대|시즌|시리즈|시즌권|시즌제|역사|역할|국가|국민|국제|국내|지역|지방|시각적|시각장|관계|관련|관여|관심|관광|관광지|관행|관망|결과|결정|결심|결산|결단|결의|결합|결과적|문화|문서|문구|문제|문의|소속|소속사|소식|소통|소형|소형주|단계|단어|단순|단지|단가|단점|기능|기관|기념|기록|기본|기본기|기초|기준점|기존|기간|기간제|상관|상하|상태계|중심|중심지|중요|중복|중간|중앙)$/;
const GENERIC_VERB_RE = /^(입다|쓰다|먹다|마시다|보다|듣다|읽다|쉬다|자다|놀다|근무|출근|퇴근|이용|사용|운동|걷다|뛰다|달리다|일하다|쇼핑|구경|기다리다|만나다|보내다|받다|주다)$/;
function isPolysemousOrVerb(keyword) {
  const clean = keyword.trim();
  if (clean.includes(' ')) return false;
  return POLYSEMY_RE.test(clean) || GENERIC_VERB_RE.test(clean);
}
const YEAR_OR_NUMBER_RE = /^\d{2,4}(년|월|일|%)?$/;
function isTooGeneric2Token(keyword) {
  const tokens = keyword.trim().split(/\s+/).filter(Boolean);
  if (tokens.length !== 2) return false;
  const [a, b] = tokens;
  if (GENERIC_BROAD_RE.test(a) && GENERIC_VAGUE_ACTION_RE.test(b)) return true;
  if (GENERIC_BROAD_RE.test(b) && GENERIC_VAGUE_ACTION_RE.test(a)) return true;
  if (GENERIC_BROAD_RE.test(a) && GENERIC_BROAD_RE.test(b)) return true;
  if (GENERIC_VAGUE_ACTION_RE.test(a) && GENERIC_VAGUE_ACTION_RE.test(b)) return true;
  if (GENERIC_BROAD_RE.test(a) && YEAR_OR_NUMBER_RE.test(b)) return true;
  if (GENERIC_BROAD_RE.test(b) && YEAR_OR_NUMBER_RE.test(a)) return true;
  return false;
}

const ALL_2CHAR_WHITELIST = new Set(['탈모','탈피','도수','비염','치질','치아','시력','척추','관절','발톱','근육','혈압','간염','대장','심장','갑상','디스크','두통','치통','복통','편두','불면','코골이','안구','구취','세럼','에센스','쿠션','틴트','크림','로션','토너','미백','주름','팩','마스크','에센','베이스','메이크','브로우','컨실','하이','쉐도','블러','입술','전세','월세','청약','금리','연체','예금','입금','출금','이체','잔금','계약','담보','신용','체크','환전','환율','대출','카드','적금','펀드','증여','상속','세금','환급','재건','재개','아파','빌라','주택','오피','땅값','평당','맥북','에어팟','갤럭시','아이폰','키보드','마우스','모니터','노트북','서피스','윈도우','iOS','M1','M2','M3','M4','A14','A15','A16','A17','A18','한식','일식','중식','양식','분식','치킨','피자','버거','커피','디저트','면','국','국밥','죽','회','초밥','라멘','돈가스','파스타','리조또','샤넬','구찌','디올','에르메스','롤렉스','나이키','아디다스','뉴발','푸마','반스','캠퍼','클락','버켄','코치','프라','셀린','버버','톰포','이유식','기저귀','분유','치발기','카시트','유모차','신생','돌상','아기','신생아','백일','직구','공구','구매','핫딜','세일','쿠폰','렌트','여권','비자','체크인','경유','직항','왕복','편도']);

function isHighIntentSingleToken(keyword, searchVolume, docCount, dcEstimated = false) {
  if (!searchVolume || !docCount) return false;
  if (dcEstimated) return false;
  const ratio = searchVolume / docCount;
  return searchVolume >= 5000 && ratio >= 3 && docCount <= 100000;
}

function isWritableKeyword(keyword, docCount, searchVolume = 0, dcEstimated = false) {
  const clean = keyword.trim();
  const tokens = clean.split(/\s+/).filter(Boolean).length;
  if (tokens === 2 && isTooGeneric2Token(keyword)) return false;
  if (isNewsNoise(keyword)) return false;
  if (isPolysemousOrVerb(keyword)) return false;
  if (tokens === 1 && GENERIC_ACTION_RE.test(clean)) return false;
  if (tokens === 1 && GENERIC_BROAD_RE.test(clean)) return false;
  if (tokens >= 2) return true;
  if (ALL_2CHAR_WHITELIST.has(clean)) return true;
  if (clean.length < 2) return false;
  if (INTENT_SUFFIX_RE.test(clean)) return false;
  if (isHighIntentSingleToken(clean, searchVolume, docCount, dcEstimated)) return true;
  if (isLikelyCelebrityName(clean)) {
    return docCount > 0 && docCount <= 500;
  }
  if (clean.length === 2) return docCount > 0 && docCount <= 100;
  if (docCount > 0 && docCount <= 300) return true;
  return false;
}

function hasCommercialIntent(keyword) { return COMMERCIAL_RE.test(keyword); }

function calculateGrade(volume, docCount, ratio, score, keyword, dcEstimated = false) {
  // ★ v2.49.x sanity gate
  let sanityApplied = false;
  if (docCount > 0 && volume > 0) {
    const halfSvRatio = docCount / (volume * 0.5);
    if (halfSvRatio >= 0.95 && halfSvRatio <= 1.05) {
      dcEstimated = true;
      sanityApplied = true;
    }
  }
  const writable = isWritableKeyword(keyword, docCount, volume, dcEstimated);
  if (!writable && docCount > 100000) return { grade: '', sanityApplied };
  if (!writable && isTooGeneric2Token(keyword)) return { grade: '', sanityApplied };
  if (isNewsNoise(keyword)) return { grade: '', sanityApplied };
  const isCelebLike = isLikelyCelebrityName(keyword);
  if (isCelebLike && docCount > 1000) return { grade: '', sanityApplied };
  if (docCount > 0 && ratio < 1.0) return { grade: '', sanityApplied };
  const allowSS = writable, allowS = writable, allowA = writable;
  const commercial = hasCommercialIntent(keyword);
  if (dcEstimated) {
    if (commercial && volume >= 1500 && score >= 70 && writable) return { grade: 'SS', sanityApplied };
    if (volume >= 3000 && score >= 75 && writable) return { grade: 'SS', sanityApplied };
    if (score >= 45 && volume >= 200 && writable) return { grade: 'A', sanityApplied };
    if (score >= 38 && volume >= 100 && writable) return { grade: 'B', sanityApplied };
    return { grade: '', sanityApplied };
  }
  if (writable && !isCelebLike && docCount > 0 && volume >= 200 && volume <= 30000 && docCount <= 12000) {
    if (ratio >= 1.7) return { grade: 'SSS', sanityApplied };
    if (commercial && ratio >= 1.3) return { grade: 'SSS', sanityApplied };
    if (ratio >= 4 && docCount <= 8000) return { grade: 'SSS', sanityApplied };
    if (commercial && docCount <= 5000 && ratio >= 1) return { grade: 'SSS', sanityApplied };
  }
  const sssScore = commercial ? 62 : 68;
  const sssRatio = commercial ? 1.3 : 1.7;
  if (score >= sssScore && volume >= 200 && volume <= 30000 && docCount > 0 && docCount <= 12000 && ratio >= sssRatio && allowSS) return { grade: 'SSS', sanityApplied };
  if (writable && !isCelebLike && docCount > 0) {
    if (ratio >= 5 && docCount <= 15000 && volume >= 500) return { grade: 'SS', sanityApplied };
    if (commercial && docCount <= 8000 && volume >= 300 && ratio >= 2) return { grade: 'SS', sanityApplied };
    if (ratio >= 3 && docCount <= 5000 && volume >= 200) return { grade: 'SS', sanityApplied };
  }
  const ssScore = commercial ? 58 : 62;
  const ssSv = commercial ? 150 : 250;
  const ssDc = commercial ? 35000 : 25000;
  const ssRatio = commercial ? 1.2 : 1.8;
  if (score >= ssScore && volume >= ssSv && docCount > 0 && docCount <= ssDc && ratio >= ssRatio && allowSS) return { grade: 'SS', sanityApplied };
  if (score >= 48 && volume >= 150 && ratio >= 0.5 && writable) return { grade: 'S', sanityApplied };
  if (score >= 38 && volume >= 100 && writable) return { grade: 'A', sanityApplied };
  if (score >= 35 && volume >= 50 && writable) return { grade: 'B', sanityApplied };
  return { grade: '', sanityApplied };
}

// ---------- seasonal-calendar 미러링 ----------
function classifySeedDomain(seed) {
  const s = seed.toLowerCase();
  if (/환급|신청|조회|민원|등본|초본|인감|공증|연말정산|소득세|법인세|국민연금|건강보험|고용보험|취득세|등록세|재산세|공제|면세|장려금|지원금|계좌|적금/.test(s)) return 'admin';
  if (/만드는법|만드는|레시피|끓이는|굽는|볶는|튀기는|만들기|음식|반찬|찌개|찜|구이|볶음|샐러드|간식|디저트|음료|커피차|밀키트|보양식|만두|김치|장아찌|국밥|냉면|비빔밥|불고기|삼겹살|치킨|떡볶이|순대|족발|보쌈|아이스크림|빵|쿠키|케이크/.test(s)) return 'food';
  if (/독립운동가|위인|영웅|애국지사|선조|역사 인물|지도자|위대한 인물/.test(s)) return 'person';
  if (/의미|기념일|축제|3\.1절|광복절|한글날|개천절|제헌절|식목일|단오|동지|어버이날|어린이날|스승의날|현충일|단군신화/.test(s)) return 'event';
  if (/세일|할인|특가|광군절|블랙프라이데이|빅스마일|쇼핑|핫딜|직구|11번가|쿠팡|마켓컬리/.test(s)) return 'shopping-event';
  if (/선물|추천|코디|패션|옷|화장품|뷰티|구두|가방|운동화|향수|화장|아이폰|갤럭시|노트북|에어컨|냉장고|세탁기/.test(s)) return 'commerce';
  if (/여행|호텔|항공|패키지|투어|렌트카|숙박|에어비앤비|일정|코스|가볼만한|관광지|명소|벚꽃 명소|단풍 명소/.test(s)) return 'travel';
  if (/대비|관리|보관|손질|청소|정리|수납|살림|꿀팁|요령|준비물|예방|방지|운동|다이어트|건강검진/.test(s)) return 'howto-life';
  return 'general';
}

const DOMAIN_SUFFIXES = {
  admin: ['방법','하는법','신청 방법','조회 방법','받는 법','대상','자격','조건','필요 서류','기간','마감일','안 됨','오류','해결 방법'],
  commerce: ['추천','순위','후기','리뷰','가격','비교','차이','브랜드','솔직 후기','인기'],
  food: ['만드는법','레시피','재료','보관법','간단','쉬운','맛있는'],
  event: ['의미','유래','역사','일정','시기','행사','풍습','음식'],
  person: ['의미','역사','이야기','생애','명언','업적'],
  'howto-life': ['방법','하는법','꿀팁','요령','추천','준비물','주의사항'],
  'shopping-event': ['할인','직구','쇼핑','구매','추천','인기','베스트'],
  travel: ['추천','코스','일정','명소','맛집','가는법','주차','입장료'],
  general: ['방법','추천','후기','비교','의미'],
};

function expandWithIntentSuffixes(seeds, perSeed = 8) {
  const result = [];
  for (const seed of seeds) {
    const clean = seed.trim();
    if (!clean) continue;
    result.push(clean);
    const domain = classifySeedDomain(clean);
    const pool = DOMAIN_SUFFIXES[domain] || DOMAIN_SUFFIXES.general;
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, Math.min(perSeed, pool.length));
    for (const suf of picks) {
      const combo = `${clean} ${suf}`;
      if (combo.length <= 40) result.push({ combo, seed: clean, suf, domain });
    }
  }
  return result;
}

// ---------- 어색한 결합 판정 ----------
// 1. 이중 접미사: seed clean 이 이미 suf 와 겹치는 토큰 포함
// 2. 도메인 충돌: 명확히 어울리지 않는 조합 (예: person → "의미" OK, "유래" 어색)
function isAwkwardCombination(seed, suf, domain) {
  const sLower = seed.toLowerCase();
  const sufLower = suf.toLowerCase();
  // 이중 접미사 (seed 가 suf 포함)
  if (sLower.includes(sufLower)) return { awkward: true, reason: 'double-suffix' };
  // person 도메인 — 일부 suffix 어색
  if (domain === 'person' && /^(의미|역사|이야기|생애|명언|업적)$/.test(suf)) {
    // person 도메인은 OK 지만 사실 단일 인물 + 의미 어색 (애매)
    return { awkward: false, reason: '' };
  }
  // event 도메인 + "음식" 조합 — 단오/동지/추석 외 어색
  if (domain === 'event' && suf === '음식') {
    if (!/단오|동지|추석|설날|어버이날|어린이날/.test(seed)) {
      return { awkward: true, reason: 'event-food-mismatch' };
    }
  }
  // commerce + "비교" — "에어컨 비교" OK 지만 단일 명사 "마우스 비교"는 살짝 어색
  // admin + "추천" — 어색
  if (domain === 'admin' && /추천|후기|리뷰|순위|가격|비교|브랜드/.test(suf)) {
    return { awkward: true, reason: 'admin-commerce-mismatch' };
  }
  return { awkward: false, reason: '' };
}

// ---------- 도메인 매핑: classify 결과 → 예상 도메인 ----------
const DOMAIN_MAP = {
  admin: 'admin',
  commerce: 'commerce',
  food: 'food',
  event: 'issue',
  person: 'person',
  'howto-life': 'commerce',     // "에어컨 청소법" → commerce 기대, howto-life 분류 가능
  'shopping-event': 'commerce',
  travel: 'travel',
  general: 'general',
};

// ---------- 시뮬레이션 실행 ----------
const rows = [];
let fakeSSS = 0, sanityHits = 0, classifyMiss = 0, awkwardSum = 0, comboTotal = 0;
let leakNearMiss = 0;       // sv*0.5 ±10% 바깥의 fallback dc (sanity 우회)
let mathRandomViolations = 0; // expandWithIntentSuffixes 가 Math.random 사용 → 메모리 위반
let indexBasedPath = 0;       // 인덱스 순서 기반 등급 부여 가능 시드
const domainBuckets = {};
const fakeSSSLeakVectors = [];

for (const { seed, expectedDomain } of ALL_SEEDS) {
  // 측정 1: 5 dc 시나리오 (sanity gate 우회 leak vector 포함)
  const r1 = calculateGrade(1000, 500, 2.0, 70, seed, false);    // sv*0.5 정확
  const r2 = calculateGrade(1000, 200, 5.0, 75, seed, false);    // 실측 (저 dc)
  const r3 = calculateGrade(1000, 0, 0, 60, seed, false);        // dc=0 측정 실패
  // ★ leak vector 1: sv*0.4 dc (sanity 우회 — halfSvRatio = 0.8, gate=0.95~1.05)
  const r4 = calculateGrade(1000, 400, 2.5, 70, seed, false);
  // ★ leak vector 2: sv*0.6 dc (halfSvRatio = 1.2, gate 우회)
  const r5 = calculateGrade(1000, 600, 1.67, 65, seed, false);
  // ★ leak vector 3: cache 에 dcEstimated=false 로 잘못 저장된 sv*0.5 값을 dcEstimated=false 전달
  //   현재 sanity gate 가 dcEstimated 강제 마킹 → SSS 차단됨 (이건 fix 잘됨)
  const r6 = calculateGrade(1000, 500, 2.0, 70, seed, true);     // dcEstimated=true 명시

  // 가짜 SSS = r1 (정확 sv*0.5) 에서 SSS 통과
  const fake = r1.grade === 'SSS' && r1.sanityApplied === false;
  if (r1.sanityApplied) sanityHits++;
  if (fake) fakeSSS++;

  // leak vector 측정 — sv*0.4, sv*0.6 (sanity gate 우회)
  if (r4.grade === 'SSS' || r5.grade === 'SSS') {
    leakNearMiss++;
    fakeSSSLeakVectors.push({
      seed,
      r4_grade: r4.grade,    // dc=sv*0.4
      r5_grade: r5.grade,    // dc=sv*0.6
    });
  }

  // Math.random 위반 — expandWithIntentSuffixes line 269 (shuffled = pool.slice().sort(() => Math.random() - 0.5))
  // 모든 시드가 Math.random 으로 suffix 순서 결정됨 → 100% 위반
  mathRandomViolations++;

  // 인덱스 기반 등급 가능 — 현재 코드는 grade promotion 시 baseScore.sort 후 round-robin
  // index 순서가 결과에 영향: 동률 score 시 첫 항목 우선 → 한 카테고리 쏠림 가능 (BRAND_PREFIX_CAP 가 일부 차단)
  const tokens = seed.split(/\s+/).filter(Boolean).length;
  if (tokens >= 2 && hasCommercialIntent(seed)) {
    indexBasedPath++;       // promotion pool 진입 가능 → tie-break index 영향
  }

  // 측정 2: classifier 도메인
  const classified = classifySeedDomain(seed);
  const mappedExpected = expectedDomain;
  const classifiedToExpected = DOMAIN_MAP[classified] || classified;
  const miss = classifiedToExpected !== mappedExpected;
  if (miss) classifyMiss++;
  if (!domainBuckets[expectedDomain]) domainBuckets[expectedDomain] = { total: 0, miss: 0 };
  domainBuckets[expectedDomain].total++;
  if (miss) domainBuckets[expectedDomain].miss++;

  // 측정 3: suffix 결합 어색?
  const combos = expandWithIntentSuffixes([seed], 8).filter(x => typeof x === 'object');
  let awkward = 0;
  const awkwardSamples = [];
  for (const c of combos) {
    const { awkward: aw, reason } = isAwkwardCombination(c.seed, c.suf, c.domain);
    if (aw) {
      awkward++;
      awkwardSum++;
      awkwardSamples.push(`${c.combo} (${reason})`);
    }
    comboTotal++;
  }

  rows.push({
    seed,
    expectedDomain,
    classified,
    classifyMiss: miss,
    grade_dc500_estimated: r1.grade,        // sv=1000, dc=500
    sanity_dc500: r1.sanityApplied,
    grade_dc200_real: r2.grade,             // sv=1000, dc=200
    grade_dc0_missing: r3.grade,            // dc 측정 실패
    fakeSSS_dc500: fake,
    suffixAwkwardRatio: combos.length ? awkward / combos.length : 0,
    awkwardSamples: awkwardSamples.slice(0, 3),
  });
}

// ---------- 요약 ----------
const total = ALL_SEEDS.length;
const summary = {
  version: '2.49.7-baseline',
  generatedAt: new Date().toISOString(),
  totalSeeds: total,
  metric1_grading: {
    fakeSSS_count_dc500: fakeSSS,
    fakeSSS_pct: ((fakeSSS / total) * 100).toFixed(1) + '%',
    sanityGate_triggered: sanityHits,
    sanityGate_triggered_pct: ((sanityHits / total) * 100).toFixed(1) + '%',
    realSSS_count_dc200: rows.filter(r => r.grade_dc200_real === 'SSS').length,
    dcMissing_filtered: rows.filter(r => r.grade_dc0_missing === '').length,
    leak_nearMiss_count: leakNearMiss,     // sanity gate 우회 (sv*0.4, sv*0.6)
    leak_nearMiss_pct: ((leakNearMiss / total) * 100).toFixed(1) + '%',
    mathRandom_violations: mathRandomViolations,
    mathRandom_pct: ((mathRandomViolations / total) * 100).toFixed(1) + '%',
    indexBased_path_seeds: indexBasedPath,
  },
  metric2_classifier: {
    classifyMiss_count: classifyMiss,
    classifyMiss_pct: ((classifyMiss / total) * 100).toFixed(1) + '%',
    perDomain: domainBuckets,
  },
  metric3_suffix: {
    awkwardCombination_count: awkwardSum,
    totalCombinations: comboTotal,
    awkward_pct: ((awkwardSum / comboTotal) * 100).toFixed(1) + '%',
  },
  metric4_cache: {
    rich_feed_cache_schema_current: 'v2.41.3-claude-md-sss',
    rich_feed_cache_schema_next: 'v2.49.8-sanity-gate',
    persistent_cache_schema_current: 'stable-v2',
    persistent_cache_schema_next: 'sanity-v3',
    expected_cache_miss_on_upgrade: '100% (full invalidation)',
    expected_dc_remeasure_on_upgrade: '100% (all fallback dc must re-verify)',
  },
};

const out = { summary, rows };
const outputPath = path.join(__dirname, '..', 'test-baseline-v2.49.7.json');
fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf8');
console.log('=== BASELINE v2.49.7 ===');
console.log(JSON.stringify(summary, null, 2));
console.log(`\nFull rows → ${outputPath}`);

// TOP 20 critical 케이스 (가짜 SSS + 어색 비율 높음)
const critical = rows
  .map(r => ({
    ...r,
    criticalScore: (r.fakeSSS_dc500 ? 5 : 0) + r.suffixAwkwardRatio * 5 + (r.classifyMiss ? 3 : 0),
  }))
  .sort((a, b) => b.criticalScore - a.criticalScore)
  .slice(0, 20);
console.log('\n=== TOP 20 CRITICAL ===');
for (const c of critical) {
  console.log(`  [${c.criticalScore.toFixed(2)}] ${c.seed} (${c.expectedDomain}→${c.classified}) fakeSSS=${c.fakeSSS_dc500} awkward=${(c.suffixAwkwardRatio*100).toFixed(0)}%`);
}
