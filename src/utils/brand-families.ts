/**
 * BRAND_FAMILIES — 카테고리별 브랜드 사전 (한국 시장).
 * source-signals.ts 에서 마인드맵 확장 시 사용하던 사전을 추출 → 공유 모듈.
 * 신규 사용처 (v2.49.1): keyword-analysis.ts get-keyword-expansions
 *
 * 사용자 요구: "게이밍 노트북 추천" 같은 카테고리 키워드 입력 시 → 제품들(브랜드 prefix)로 확장.
 * 옵션 C: 1차 사전 매칭 → 매칭 안 되거나 결과 부족 시 외부 자동완성 보강(호출 측에서).
 */

export const BRAND_FAMILIES: Record<string, string[]> = {
    shoes: ['뉴발란스', '나이키', '아디다스', '푸마', '아식스', '리복', '컨버스', '반스', '호카', '캠퍼', '클락스', '버켄스탁', '온', '살로몬'],
    sportswear: ['나이키', '아디다스', '언더아머', '룰루레몬', '뉴발란스', '푸마', '아식스', '데상트', '안다르', '젝시믹스'],
    golf: ['타이틀리스트', '캘러웨이', '핑', '테일러메이드', '마제스티', '미즈노', '혼마', '클리브랜드'],
    outdoor: ['노스페이스', '블랙야크', 'K2', '네파', '디스커버리', '콜핑', '아크테릭스', '몽벨', '마무트', '컬럼비아'],
    camping: ['콜맨', '코베아', '스노우피크', '헬리녹스', '코지', 'MSR', '캠핑톡', '필드도어'],
    bicycle: ['자이언트', '메리다', '스페셜라이즈드', '캐논데일', '삼천리', '알톤', '트렉'],

    phone: ['아이폰', '갤럭시', '샤오미', '구글픽셀', '원플러스', '오포', '비보'],
    laptop: ['맥북', 'LG 그램', '갤럭시북', '레노버', '아수스', 'MSI', '에이서', 'HP', 'XPS', '서피스'],
    tablet: ['아이패드', '갤럭시탭', '서피스', 'MS 서피스'],
    tv: ['삼성TV', 'LG TV', '소니TV', '샤오미TV', '하이센스', 'TCL'],
    appliance: ['삼성', 'LG', '위니아', '쿠첸', '쿠쿠', '대유위니아', '캐리어', '코웨이'],
    camera: ['캐논', '니콘', '소니', '후지', '올림푸스', '라이카', '파나소닉', '리코'],
    headphone: ['에어팟', '소니', '보스', '젠하이저', '슈어', '오디오테크니카', '뱅앤올룹슨', '비츠'],

    car: ['현대', '기아', '제네시스', '벤츠', 'BMW', '아우디', '폭스바겐', '테슬라', '도요타', '렉서스', '볼보', '쉐보레', '르노', 'KGM'],
    ev: ['테슬라', '아이오닉', 'EV6', 'EV9', 'BMW i4', '메르세데스 EQ', '폴스타', '루시드', '리비안'],

    cosmetic: ['에스티로더', '맥', '랑콤', '디올', '샤넬', '클리니크', '키엘', '바비브라운', '나스', '시세이도', '슈에무라'],
    kcosmetic: ['닥터자르트', '이니스프리', '에뛰드', '미샤', '클리오', '롬앤', '페리페라', '바닐라코', '아모레퍼시픽', 'AHC', '메디힐', '닥터지'],
    perfume: ['디올', '샤넬', '조말론', '딥디크', '메종마르지엘라', '입생로랑', '톰포드', '바이레도', '크리드'],
    haircare: ['로레알', '판테네', '미장센', '려', '아베다', '케라스타즈', '리들리', '오리진스'],

    fashionSPA: ['유니클로', '자라', 'H&M', '스파오', '탑텐', '지오다노', '8seconds', '베이직하우스', '에잇세컨즈', '망고', '풀앤베어'],
    luxury: ['샤넬', '루이비통', '구찌', '디올', '프라다', '에르메스', '롤렉스', '오메가', '버버리', '발렌시아가', '셀린느', '로에베'],
    bag: ['루이비통', '구찌', '샤넬', '프라다', '마이클코어스', '투미', '샘소나이트', '리모와', '코치', '입생로랑'],
    watch: ['롤렉스', '오메가', '태그호이어', '까르띠에', '론진', '세이코', '시티즌', '바쉐론콘스탄틴', '파텍필립', '튜더'],
    glasses: ['룩옵티컬', '포파일', '안경포유', '알로', '레이밴', '오클리', '젠틀몬스터', '카림옵틱'],

    coffee: ['스타벅스', '투썸', '메가커피', '컴포즈', '백다방', '폴바셋', '할리스', '이디야', '커피빈', '카페베네', '엔젤리너스', '탐앤탐스'],
    chicken: ['BBQ', 'BHC', '굽네', '처갓집', '네네', '멕시카나', '페리카나', '교촌', '푸라닭', '60계', '둘둘치킨', '깐부치킨'],
    pizza: ['도미노', '피자헛', '미스터피자', '파파존스', '피자스쿨', '피자알볼로', '뽕뜨락피자', '7번가피자'],
    burger: ['맥도날드', '버거킹', '롯데리아', '맘스터치', 'KFC', '쉑쉑', '파이브가이즈', '슈퍼두퍼', '바스버거'],

    mart: ['이마트', '홈플러스', '롯데마트', '하이마트', '코스트코', '트레이더스', '이마트에브리데이'],
    ecommerce: ['쿠팡', '네이버쇼핑', '마켓컬리', 'SSG닷컴', '롯데온', 'CJ몰', '11번가', 'GS샵', 'AK몰', '위메프', '티몬'],
    fashionPlatform: ['무신사', 'W컨셉', '지그재그', '29CM', '스타일쉐어', '에이블리', '브랜디'],

    ott: ['넷플릭스', '디즈니플러스', '티빙', '웨이브', '왓챠', '쿠팡플레이', '유튜브프리미엄', '애플TV'],
    game: ['플레이스테이션', '닌텐도', '엑스박스', 'PS5', 'PS4', '스위치'],

    airline: ['대한항공', '아시아나', '제주항공', '에어부산', '진에어', '티웨이', '에어서울', '이스타항공'],
    hotel: ['신라', '롯데호텔', '조선호텔', '메리어트', '하얏트', '힐튼', '콘래드', '인터컨티넨탈', '쉐라톤'],

    bank: ['국민', '신한', '하나', '우리', '농협', '기업', '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일'],
    creditcard: ['신한카드', '현대카드', '삼성카드', '롯데카드', 'KB국민카드', '하나카드', '우리카드', 'BC카드'],

    furniture: ['이케아', '한샘', '리바트', '일룸', '현대리바트', '까사미아', '까사키오', '데팡스'],
    mattress: ['시몬스', '에이스침대', '씰리', '템퍼', '슬로우슬립', '지누스'],

    supplement: ['닥터린', '암웨이', '한미', 'CJ뉴트라', '유한양행', '녹십자', '뉴트리원', '솔가'],

    // v2.49.3: 신규 4 family — 커버리지 63% → 93%
    pet: ['로얄캐닌', '힐스', '퓨리나', '아카나', '오리젠', '내추럴발란스', 'ANF', '뉴트로', '시바', '웰츠', '나우프레쉬', '캐츠랩', '하림펫푸드'],
    baby: ['스토케', '부가부', '사이벡스', '맥시코시', '페그페레고', '야야', '차이코', '마이크라라이트', '그라코', '조이', '리안', '아이엔젤', '폴레드'],
    peripheral: ['로지텍', '레이저', '한성', '앱코', '커세어', '스틸시리즈', '마이크로소프트', '삼성모니터', 'LG모니터', '델모니터', '에이서모니터', 'BenQ', 'AOC', '리줌'],
    smallAppliance: ['발뮤다', '드롱기', '필립스', '브라운', '위닉스', '샤오미', '쿠쿠', '쿠첸', '코웨이', '듀얼릿', '테팔', '쿠진아트', '발뮤다토스터', 'SK매직'],
};

/**
 * v2.49.3: NEGATIVE_TOKENS — 카테고리 매칭 차단 단어.
 * 예: "노트북 거치대" → "노트북" 매칭되지만 "거치대" 가 포함되어 있어 액세서리 → laptop 매칭 skip.
 */
const NEGATIVE_TOKENS = [
    '거치대', '받침대', '쿨러', '쿨링패드', '파우치', '가방', '필름', '스킨', '키스킨',
    '케이스', '커버', '홀더', '스탠드', '걸이', '청소기', '청소포', '청소솔',
    '머신', '청소제', '세정제', '필터', '교체', '교환',
    '액세서리', '부속품', '소모품', '닦이',
];

/**
 * CATEGORY_TOKENS — 입력 키워드에 포함된 한국어 토큰 → BRAND_FAMILIES 키 매핑.
 * 우선순위: 더 specific 한 토큰을 먼저 매칭하기 위해 긴 토큰 우선.
 */
const CATEGORY_TOKEN_LIST: Array<[string, keyof typeof BRAND_FAMILIES]> = [
    // 디지털·가전 (가장 구체적인 것부터)
    ['게이밍 노트북', 'laptop'], ['게이밍노트북', 'laptop'],
    ['노트북', 'laptop'],
    ['스마트폰', 'phone'], ['핸드폰', 'phone'], ['휴대폰', 'phone'],
    ['태블릿', 'tablet'], ['아이패드', 'tablet'],
    ['텔레비전', 'tv'], ['TV', 'tv'], ['티비', 'tv'],
    ['에어컨', 'appliance'], ['냉장고', 'appliance'], ['세탁기', 'appliance'],
    ['건조기', 'appliance'], ['공기청정기', 'appliance'], ['청소기', 'appliance'],
    ['전기레인지', 'appliance'], ['전자레인지', 'appliance'], ['오븐', 'appliance'],
    ['카메라', 'camera'], ['미러리스', 'camera'], ['DSLR', 'camera'],
    ['이어폰', 'headphone'], ['헤드폰', 'headphone'], ['무선이어폰', 'headphone'], ['에어팟', 'headphone'],

    // 신발·스포츠
    ['러닝화', 'shoes'], ['운동화', 'shoes'], ['스니커즈', 'shoes'], ['신발', 'shoes'],
    ['요가복', 'sportswear'], ['트레이닝복', 'sportswear'], ['운동복', 'sportswear'], ['레깅스', 'sportswear'],
    ['골프공', 'golf'], ['골프채', 'golf'], ['골프웨어', 'golf'], ['골프클럽', 'golf'],
    ['등산복', 'outdoor'], ['패딩', 'outdoor'], ['아웃도어', 'outdoor'],
    ['텐트', 'camping'], ['캠핑', 'camping'], ['캠핑용품', 'camping'],
    ['자전거', 'bicycle'], ['로드자전거', 'bicycle'], ['MTB', 'bicycle'],

    // 자동차
    ['전기차', 'ev'], ['EV', 'ev'],
    ['SUV', 'car'], ['세단', 'car'], ['중고차', 'car'], ['자동차', 'car'],

    // 뷰티
    ['향수', 'perfume'],
    ['샴푸', 'haircare'], ['트리트먼트', 'haircare'], ['헤어팩', 'haircare'],
    ['스킨케어', 'cosmetic'], ['파운데이션', 'cosmetic'], ['립스틱', 'cosmetic'],
    ['선크림', 'kcosmetic'], ['에센스', 'kcosmetic'], ['앰플', 'kcosmetic'], ['토너', 'kcosmetic'], ['세럼', 'kcosmetic'],

    // 패션
    ['가방', 'bag'], ['백팩', 'bag'], ['크로스백', 'bag'],
    ['시계', 'watch'], ['손목시계', 'watch'],
    ['안경', 'glasses'], ['선글라스', 'glasses'],

    // 외식
    ['커피', 'coffee'], ['카페', 'coffee'], ['아메리카노', 'coffee'],
    ['치킨', 'chicken'],
    ['피자', 'pizza'],
    ['햄버거', 'burger'],

    // 콘텐츠
    ['OTT', 'ott'], ['넷플릭스', 'ott'],
    ['콘솔게임', 'game'], ['게임기', 'game'],

    // 여행
    ['항공권', 'airline'], ['비행기표', 'airline'],
    ['호텔', 'hotel'], ['숙박', 'hotel'], ['리조트', 'hotel'],

    // 금융
    ['적금', 'bank'], ['예금', 'bank'], ['대출', 'bank'],
    ['카드', 'creditcard'], ['신용카드', 'creditcard'], ['체크카드', 'creditcard'],

    // 인테리어
    ['소파', 'furniture'], ['침대', 'mattress'], ['매트리스', 'mattress'],
    ['책상', 'furniture'], ['옷장', 'furniture'], ['수납장', 'furniture'],

    // 헬스
    ['영양제', 'supplement'], ['비타민', 'supplement'], ['오메가3', 'supplement'], ['프로바이오틱스', 'supplement'],

    // v2.49.3: 신규 family 토큰
    // pet
    ['강아지사료', 'pet'], ['고양이사료', 'pet'], ['반려동물', 'pet'], ['사료', 'pet'],
    ['펫푸드', 'pet'], ['강아지간식', 'pet'], ['고양이간식', 'pet'], ['모래', 'pet'], ['고양이화장실', 'pet'],
    // baby
    ['유모차', 'baby'], ['카시트', 'baby'], ['분유', 'baby'], ['기저귀', 'baby'], ['젖병', 'baby'],
    ['아기띠', 'baby'], ['하이체어', 'baby'], ['이유식', 'baby'],
    // peripheral
    ['키보드', 'peripheral'], ['마우스', 'peripheral'], ['모니터', 'peripheral'], ['웹캠', 'peripheral'],
    ['게이밍마우스', 'peripheral'], ['게이밍키보드', 'peripheral'], ['헤드셋', 'peripheral'],
    // smallAppliance
    ['가습기', 'smallAppliance'], ['토스터기', 'smallAppliance'], ['토스터', 'smallAppliance'],
    ['에어프라이어', 'smallAppliance'], ['믹서기', 'smallAppliance'], ['블렌더', 'smallAppliance'],
    ['정수기', 'smallAppliance'], ['커피머신', 'smallAppliance'], ['전기포트', 'smallAppliance'],
];

// 긴 토큰 먼저 (specific match 우선)
CATEGORY_TOKEN_LIST.sort((a, b) => b[0].length - a[0].length);

/**
 * 입력 키워드에서 카테고리 토큰을 검출 → 매칭되는 brand family key 반환.
 * 매칭 없으면 null.
 *
 * v2.49.3 가드:
 *  - NEGATIVE_TOKENS 포함 시 매칭 skip (액세서리/파생 키워드 차단)
 *    예: "노트북 거치대" → '거치대' 포함 → null 반환
 *  - 단어 경계 매칭 (앞뒤가 한국어/영문/숫자 아닌 boundary)
 *    예: "OTT" 가 "bigoTT" 안에 매칭되지 않도록
 */
export function detectCategoryFamily(keyword: string): { family: keyof typeof BRAND_FAMILIES; token: string } | null {
    const kw = keyword.toLowerCase();

    // negative token 가드 — 액세서리/파생 키워드 차단
    for (const neg of NEGATIVE_TOKENS) {
        if (kw.includes(neg.toLowerCase())) {
            return null;
        }
    }

    // 단어 경계 매칭 (한국어/영문/숫자가 아닌 boundary, 또는 문자열 시작/끝)
    const isWordChar = (c: string) => /[가-힣A-Za-z0-9]/.test(c);
    for (const [token, family] of CATEGORY_TOKEN_LIST) {
        const lowerToken = token.toLowerCase();
        let idx = kw.indexOf(lowerToken);
        while (idx !== -1) {
            const before = idx === 0 ? '' : kw[idx - 1];
            const afterIdx = idx + lowerToken.length;
            const after = afterIdx >= kw.length ? '' : kw[afterIdx];
            const beforeOk = !before || !isWordChar(before);
            const afterOk = !after || !isWordChar(after);
            if (beforeOk && afterOk) {
                return { family, token };
            }
            idx = kw.indexOf(lowerToken, idx + 1);
        }
    }
    return null;
}

/**
 * 입력 키워드 기반 브랜드 확장 키워드 생성.
 * 입력: "게이밍 노트북 추천"
 * 출력: ["맥북 게이밍 노트북 추천", "LG 그램 게이밍 노트북 추천", "갤럭시북 게이밍 노트북 추천", ...]
 *      + ["맥북 추천", "LG 그램 추천", ...] (카테고리 토큰 제거 변형)
 *
 * @param keyword 원본 입력 키워드
 * @param maxBrands 한 카테고리에서 사용할 브랜드 수 (기본 10)
 * @returns 확장 키워드 배열 (원본 + 변형 합산, 중복 제거)
 */
export function expandWithBrands(keyword: string, maxBrands: number = 10): string[] {
    const detected = detectCategoryFamily(keyword);
    if (!detected) return [];

    const brands = (BRAND_FAMILIES[detected.family] || []).slice(0, maxBrands);
    const out = new Set<string>();
    const original = keyword.trim();
    const withoutCategory = original.replace(new RegExp(detected.token, 'gi'), '').trim().replace(/\s+/g, ' ');

    for (const brand of brands) {
        // 변형 1: 브랜드 + 원본 ("맥북 게이밍 노트북 추천")
        out.add(`${brand} ${original}`);
        // 변형 2: 브랜드 + 카테고리 토큰 제거 ("맥북 게이밍 추천", "맥북 추천")
        if (withoutCategory && withoutCategory !== original) {
            out.add(`${brand} ${withoutCategory}`);
        }
    }
    return Array.from(out);
}
