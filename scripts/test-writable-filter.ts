/**
 * isWritableKeyword 회귀 검증 — v2.42.51
 *   에이전트팀 4명 비평 반영: 도메인 단어/2토큰 정상/노이즈 차단
 */

const GENERIC_BROAD_RE = /^(적금|예금|카드|대출|보험|투자|주식|펀드|ETF|연금|세금|건강|영양제|비타민|음식|요리|청소|여행|맛집|공부|운동|헬스|다이어트|뷰티|화장품|샴푸|선크림|의류|패션|가구|인테리어|네이버|구글|카카오|삼성|엘지|쿠팡|클로드|챗GPT|유튜브|인스타|페이스북|브랜드|제품|상품|서비스|리뷰|일본|미국|중국|한국|영국|독일|프랑스|이탈리아|러시아|인도|호주|캐나다|스페인|태국|베트남|유럽|아시아|동남아|북미|남미|중동|서울|부산|대구|인천|제주|강남|홍대|이태원|명동|성수|경기|강원|충청|전라|경상|국내|국외|해외|반려동물|돼지고기|소고기|닭고기|생선|아파트|빌라|오피스텔|주식종류|레고|정부|로마|청약|영화|드라마|음악|게임|애니|웹툰|소설|방송|예능|공연|뉴스|사건|사고|이슈|사람|인물|기업|회사|단체|기관|학교|대학|학원|은행|금융|경제|사회|정치|스포츠|선수|팀|경기|시합|대회|올림픽|월드컵|IT|AI|로봇|우주|과학|기술|발명|연구|교육|입시|시험|공무원|자격증|취업|직장|연봉|면접|국민연금|아동수당|근로장려금|자녀장려금|청년도약계좌|청년희망적금|기초연금|실업급여|재난지원금|건강보험|고용보험|산재보험|4대보험|사대보험|청년수당|국민행복카드|취업지원센터|건강보험공단|국민연금공단|농협금융|청약홈|정부24|홈택스|협력|대상|사정|병용|산산조각|리브스|호르무즈|우베|자위행위|절반|일부|전부|종합|일반|보통|평균|비율|수준|결과|가능|불가|필수|차이|이유|장점|단점|특징|특성|기능|효율|효과)$/;
const GENERIC_VAGUE_ACTION_RE = /^(추천|후기|리뷰|비교|순위|가격|방법|꿀팁|정리|할인|세일|이벤트|인기|베스트|신상|최신|tips|모음|목록|소개|설명|정보|뜻|의미|브랜드|종류|안내|공지)$/i;
const GENERIC_PROCESS_ACTION_RE = /^(신청|해지|환불|가입|취소|결제|구매|판매|반품|교환|반납|연장|예약|배송|발급|승인|승급|등록|탈퇴|로그인|로그아웃|회원|업데이트|다운로드|설치|제거|삭제|초기화|변경|수정|이전|이체|입금|출금|적립|충전|충전금|증명|발행|발송|수신|전송|확인서|증명서|영수증|계산|계산법|환산)$/i;
const GENERIC_ACTION_RE = new RegExp(`${GENERIC_VAGUE_ACTION_RE.source.slice(1,-1)}|${GENERIC_PROCESS_ACTION_RE.source.slice(1,-1)}`, 'i');
const INTENT_SUFFIX_RE = /(추천|후기|비교|방법|순위|종류|가격|리뷰|만드는법|만들기|하는법|사용법|뜻|차이|장단점|원인|증상|효과|부작용|쓰는법|설치법|가입|해지|환불)$/;
const NEWS_NOISE_RE = /^(분기|폐지|종류|세계|개최|사망|협상|발표|공개|선언|입장|대응|가능성|전망|예정|인터뷰|논란|제기|의혹|해명|공지|답변|반응|이슈|속보|긴급|비상|충격|폭로|고백|루머|소문|공방|격돌|대결|파장|파문|후폭풍|여파|보도|특종|거부|결렬|철회|취소|승인|기각|제출|접수|공시|공표|해제|연장|중단|재개|해임|사임|지명|임명|승진|퇴임|방문|순방|귀국|출국|도착|출발|회담|회의|총회|위원회|처분|결정|검토|합의|체결|조사|수사|기소|판결|선고|결과|최종|잠정|추가|수정|확정|변경|조정|전달|언급|경고|강조|지적|주장|반박|반대|찬성|동의|거절|요구|요청|제안|건의|권고|충고|촉구|호소|지지|비판|우려|기대|환영|축하|위로|애도|분노|공분|여론|민심|표심|속설|미담)$/;
const KOREAN_SURNAMES = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주우구민유진지엄채원방공현함변염여추도석선설마길연위표명기반나왕금옥육인맹제모탁국어육';
const CELEB_PATTERN_RE = new RegExp(`^[${KOREAN_SURNAMES}][가-힣]{1,3}$`);
// 테스트 호환용 — v2.42.51 평면 리스트
const DOMAIN_2CHAR_WHITELIST_FLAT = new Set([
    '탈모', '탈피', '도수', '비염', '치질', '치아', '시력', '척추', '관절', '발톱', '근육', '혈압', '간염', '대장', '심장', '갑상', '디스크',
    '세럼', '에센스', '쿠션', '틴트', '크림', '로션', '토너', '미백', '주름',
    '전세', '월세', '청약', '금리', '연체', '예금', '입금', '출금', '이체', '잔금', '계약', '담보', '신용', '체크', '환전', '환율',
    '맥북', '에어팟', '갤럭시', '아이폰', '키보드', '마우스', '모니터', '노트북', '서피스', '윈도우', 'iOS',
    '한식', '일식', '중식', '양식', '분식', '치킨', '피자', '버거', '커피', '디저트',
    '샤넬', '구찌', '디올', '에르메스', '롤렉스', '나이키', '아디다스', '뉴발', '푸마', '반스',
    '이유식', '기저귀', '분유', '치발기', '카시트', '유모차',
    '직구', '공구', '구매',
]);

function isLikelyCelebrityName(keyword: string): boolean {
    const clean = keyword.trim();
    if (clean.length < 2 || clean.length > 4) return false;
    if (clean.includes(' ')) return false;
    return CELEB_PATTERN_RE.test(clean);
}
function isNewsNoise(keyword: string): boolean {
    const clean = keyword.trim();
    if (clean.includes(' ')) return false;
    return NEWS_NOISE_RE.test(clean);
}
function isTooGeneric2Token(keyword: string): boolean {
    const tokens = keyword.trim().split(/\s+/).filter(Boolean);
    if (tokens.length !== 2) return false;
    const [a, b] = tokens;
    if (GENERIC_BROAD_RE.test(a) && GENERIC_VAGUE_ACTION_RE.test(b)) return true;
    if (GENERIC_BROAD_RE.test(b) && GENERIC_VAGUE_ACTION_RE.test(a)) return true;
    if (GENERIC_BROAD_RE.test(a) && GENERIC_BROAD_RE.test(b)) return true;
    if (GENERIC_VAGUE_ACTION_RE.test(a) && GENERIC_VAGUE_ACTION_RE.test(b)) return true;
    return false;
}

function isHighIntentSingleToken(keyword: string, sv: number, dc: number): boolean {
    if (!sv || !dc) return false;
    const ratio = sv / dc;
    return sv >= 1000 && ratio >= 2 && dc <= 100000;
}

function isWritableKeyword(keyword: string, docCount: number, sv: number = 0): boolean {
    const clean = keyword.trim();
    const tokens = clean.split(/\s+/).filter(Boolean).length;
    if (tokens === 2 && isTooGeneric2Token(keyword)) return false;
    if (isNewsNoise(keyword)) return false;
    if (tokens === 1 && GENERIC_ACTION_RE.test(clean)) return false;
    if (tokens === 1 && GENERIC_BROAD_RE.test(clean)) return false;
    if (tokens >= 2) return true;
    if (DOMAIN_2CHAR_WHITELIST_FLAT.has(clean)) return true;
    if (clean.length < 2) return false;
    if (INTENT_SUFFIX_RE.test(clean)) return false;
    if (isHighIntentSingleToken(clean, sv, docCount)) return true;
    if (isLikelyCelebrityName(clean)) {
        return docCount > 0 && docCount <= 500;
    }
    if (clean.length === 2) return docCount > 0 && docCount <= 100;
    if (docCount > 0 && docCount <= 300) return true;
    return false;
}

const cases: { kw: string; dc: number; sv?: number; expected: boolean; note: string }[] = [
    // v2.42.50 핵심 차단 (유지)
    { kw: '절반', dc: 440, expected: false, note: '추상명사 차단' },
    { kw: '해지', dc: 2280, expected: false, note: '행위어 단독 차단' },
    { kw: '환불', dc: 100, expected: false, note: '어미 단독 차단' },
    { kw: '가입', dc: 100, expected: false, note: '어미 단독 차단' },
    { kw: '추천', dc: 100, expected: false, note: 'GENERIC_ACTION 차단' },

    // v2.42.51 도메인 2자 화이트리스트 (복구)
    { kw: '맥북', dc: 50000, expected: true, note: '🆕 IT 브랜드 살림' },
    { kw: '한식', dc: 30000, expected: true, note: '🆕 식음 도메인 살림' },
    { kw: '샤넬', dc: 80000, expected: true, note: '🆕 명품 브랜드 살림' },
    { kw: '세럼', dc: 25000, expected: true, note: '🆕 뷰티 도메인 살림' },
    { kw: '전세', dc: 100000, expected: true, note: '🆕 부동산 핵심 살림' },
    { kw: '금리', dc: 80000, expected: true, note: '🆕 재테크 핵심 살림' },
    { kw: '탈모', dc: 50000, expected: true, note: '🆕 의료 핵심 살림' },
    { kw: '직구', dc: 40000, expected: true, note: '🆕 쇼핑 의도 명확' },
    { kw: '이유식', dc: 30000, expected: true, note: '🆕 육아 핵심 살림' },

    // BROAD ∩ ACTION 중복 제거 — 정상 2토큰 (v2.42.51 회귀 검증)
    { kw: '보험 등록', dc: 5000, expected: true, note: '🆕 정상 2토큰 (BROAD에서 등록 제거)' },
    { kw: '카드 발급', dc: 10000, expected: true, note: '🆕 정상 2토큰' },
    { kw: '청약 조회', dc: 8000, expected: true, note: '🆕 정상 2토큰' },
    { kw: '자격증 취득', dc: 12000, expected: true, note: '🆕 정상 2토큰' },

    // 정상 2토큰+ 통과
    { kw: '다이어트 식단 추천', dc: 5000, expected: true, note: '✅' },
    { kw: '뉴발란스 327 코디', dc: 3000, expected: true, note: '✅' },
    { kw: '주택청약 1순위 조건', dc: 4787, expected: true, note: '✅' },
    { kw: '디딤돌대출 조건', dc: 2385, expected: true, note: '✅' },

    // 1자 차단
    { kw: '집', dc: 100, expected: false, note: '✅ 1자 단독 차단' },

    // 인명
    { kw: '김연아', dc: 100, expected: true, note: '✅ 인명 dc≤500' },
    { kw: '이재명', dc: 100, expected: true, note: '✅ 인명' },

    // 2자 비-화이트리스트 — dc 100 이하만 통과
    { kw: '글피', dc: 50, expected: true, note: '✅ 길이 2 + dc≤100 (희귀 단어)' },
    { kw: '글피', dc: 500, expected: false, note: '✅ 길이 2 + dc>100 (모호함)' },

    // 3자 일반 명사 — dc 300 이하만 통과
    { kw: '아메리카노', dc: 200, expected: true, note: '✅ 길이 3+ + dc≤300' },
    { kw: '아메리카노', dc: 5000, expected: false, note: '✅ 길이 3+ + dc>300 (BROAD 미포함, 너무 일반)' },

    // v2.42.53: 단일 토큰 의도 명확 (sv/dc ratio 높음) → 통과
    { kw: '임플란트', dc: 50000, sv: 120000, expected: true, note: '🆕 의료 단일 SSS — sv 12만, ratio 2.4 → 통과' },
    { kw: '도수치료', dc: 8000, sv: 30000, expected: true, note: '🆕 의료 단일 SSS — ratio 3.75' },
    { kw: '디카페인', dc: 5000, sv: 18000, expected: true, note: '🆕 식음 단일 SSS — ratio 3.6' },
    { kw: '공진단', dc: 2000, sv: 8000, expected: true, note: '🆕 의료 단일 SSS — ratio 4' },
    // 단일 토큰이지만 의도 분산 (낮은 ratio) → 차단
    { kw: '아메리카노', dc: 5000, sv: 7000, expected: false, note: '✅ 의도 분산: ratio 1.4 (2 미만) → 차단' },
    // 단일 토큰 + 낮은 sv → 차단
    { kw: '임플란트', dc: 50000, sv: 500, expected: false, note: '✅ sv 1000 미만 → 차단' },
];

console.log('='.repeat(95));
console.log('🧪 isWritableKeyword v2.42.51 회귀 검증 (도메인 화이트리스트 + 2토큰 회귀)');
console.log('='.repeat(95));
console.log(`${'키워드'.padEnd(28)} | dc | 기대 | 실제 | OK`);
console.log('-'.repeat(95));

let pass = 0;
const failed: typeof cases = [];
for (const c of cases) {
    const got = isWritableKeyword(c.kw, c.dc, c.sv || 0);
    const ok = got === c.expected;
    if (ok) pass++; else failed.push(c);
    console.log(`${(ok ? '✅' : '❌')} ${c.kw.padEnd(26)} | ${String(c.dc).padStart(6)} | ${String(c.expected).padEnd(5)} | ${String(got).padEnd(5)} | ${c.note}`);
}
console.log('-'.repeat(95));
console.log(`${pass === cases.length ? '✅' : '❌'} ${pass}/${cases.length} 통과`);
if (failed.length > 0) {
    console.log('\n실패 케이스:');
    failed.forEach(f => console.log(`  ${f.kw} (dc=${f.dc}) — ${f.note}`));
}
console.log('='.repeat(95));
