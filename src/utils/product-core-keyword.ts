/**
 * 상품명 → **사람이 실제로 치는 핵심 검색어**.
 *
 * 왜 다시 만드나: 앞선 규칙은 "브랜드 + 뒤쪽 어절 2개"였다. 상품명 끝에 수식어를
 * 몰아 쓰는 요즘 등록 관행에서 이게 무너진다 — 실사고:
 *   '오아 에어리소닉 BLDC 플라즈마 헤어 드라이기 항공모터 고속 드라이어 음이온 저소음'
 *     → '오아 음이온 저소음'   (뭘 파는 물건인지 사라짐)
 *   '매직캔 280 그린 로고리필 기저귀 쓰레기봉투'
 *     → '매직캔 쓰레기봉투'    ('기저귀'가 날아가 거짓 "자리 있음"이 됨)
 *
 * 그래서 **품목 명사**를 사전으로 찾는다. 사람은 모델명(에어리소닉·BLDC)이 아니라
 * 품목으로 검색한다. 사전에 없으면 옛 규칙으로 떨어뜨린다 — 아무것도 못 내느니
 * 낫고, 사전은 실측을 보며 늘리면 된다.
 */

/** 품목 명사. 긴 것부터 봐야 '건전지'보다 'AAA건전지'가 먼저 잡힌다. */
const CATEGORY_NOUNS: readonly string[] = [
    // 생활·주방
    '쓰레기봉투', '음식물처리기', '밀폐용기', 'food', '주방세제', '설거지비누', '수세미', '키친타올', '키친타월',
    '도시락김', '조미김', '즉석밥', '라면', '생수', '커피믹스', '원두', '텀블러', '보온병', '도마', '프라이팬',
    '냄비', '에어프라이어', '전기포트', '가스레인지', '인덕션', '식기건조대', '물병', '컵',
    // 청소·세탁
    '청소기', '로봇청소기', '스팀청소기', '세탁세제', '섬유유연제', '표백제', '탈취제', '방향제', '물티슈',
    '휴지', '화장지', '빨래건조대', '옷걸이', '수납함', '정리함', '옷정리함', '압축팩',
    // 미용·위생
    '드라이기', '고데기', '전기면도기', '제모기', '구강세정기', '전동칫솔', '칫솔', '치약', '가글',
    '샴푸', '린스', '트리트먼트', '바디워시', '비누', '선크림', '스킨', '로션', '에센스', '세럼', '앰플',
    '마스크팩', '클렌징폼', '향수', '생리대', '기저귀', '물티슈',
    // 가전·디지털
    '선풍기', '손풍기', '서큘레이터', '에어컨', '제습기', '가습기', '공기청정기', '히터', '온풍기', '전기장판',
    '전기요', '노트북', '모니터', '키보드', '마우스', '이어폰', '헤드폰', '스피커', '충전기', '보조배터리',
    '케이블', '거치대', '공유기', 'ssd', 'usb', '메모리카드', '건전지', 'aaa건전지', 'aa건전지', '블랙박스',
    '스마트워치', '태블릿', '프린터', '마이크', '웹캠', '조명', '스탠드',
    // 가구·인테리어
    '의자', '책상', '침대', '매트리스', '소파', '선반', '수납장', '행거', '커튼', '러그', '매트', '거울',
    '시계', '액자', '화분', '조명등',
    // 식품·건강
    '영양제', '비타민', '유산균', '홍삼', '프로틴', '콜라겐', '오메가3', '단백질보충제', '다이어트보조제',
    '견과류', '과일', '한우', '삼겹살', '등갈비', '닭가슴살', '김치', '반찬', '밀키트',
    // 반려·육아
    '사료', '간식', '배변패드', '고양이모래', '스크래처', '하네스', '이발기', '분유', '이유식', '젖병',
    '유모차', '카시트', '아기띠', '물티슈',
    // 패션·잡화
    '운동화', '슬리퍼', '구두', '샌들', '가방', '백팩', '지갑', '벨트', '모자', '양말', '티셔츠', '셔츠',
    '바지', '원피스', '자켓', '패딩', '수영복', '우산',
    // 자동차·스포츠·기타
    '워셔액', '와이퍼', '엔진오일', '타이어', '카매트', '세차용품', '자전거', '텐트', '침낭', '캠핑의자',
    '요가매트', '아령', '헬스장갑', '골프공', '낚싯대', '수영장', '문구', '노트', '펜', '만년필', '샤프',
];

/** 긴 명사부터 검사한다 — 'AAA건전지'가 '건전지'에 먹히면 안 된다. */
const SORTED_NOUNS = [...CATEGORY_NOUNS].sort((a, b) => b.length - a.length);

/** 모델명·규격으로 보이는 어절. 사람은 이걸로 검색하지 않는다. */
function isModelToken(token: string): boolean {
    if (/\d/.test(token)) return true;              // 280, 3in1, B-UV
    if (/^[A-Za-z][A-Za-z-]*$/.test(token)) return true; // BLDC, MAX
    return false;
}

const COLOR = /^(그린|블루|레드|블랙|화이트|핑크|옐로|옐로우|퍼플|그레이|네이비|실버|골드|브라운|베이지)$/;

/**
 * 어절에서 품목 명사를 찾는다. 어절 자체가 명사를 품고 있으면(‘AAA건전지’) 그 어절을 쓴다.
 *
 * **뒤에서부터** 찾는다 — 한국어 복합어는 뒤가 머리말이다.
 * '기저귀 쓰레기봉투'에서 앞부터 찾으면 '기저귀'가 잡혀 '매직캔 로고리필 기저귀'가
 * 되고, 파는 물건(봉투)이 사라진다. 실측으로 확인한 순서다.
 */
function findCategory(tokens: string[]): { index: number; word: string } | null {
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
        const lower = tokens[i]!.toLowerCase();
        for (const noun of SORTED_NOUNS) {
            if (lower.includes(noun)) return { index: i, word: tokens[i]! };
        }
    }
    return null;
}

/**
 * 핵심 검색어. 브랜드 + (바로 앞 수식어) + 품목 명사.
 *
 * 바로 앞 수식어를 붙이는 이유: '기저귀 쓰레기봉투'와 '쓰레기봉투'는 다른 물건이다.
 * 다만 모델명·색상·숫자는 버린다 — 사람이 그렇게 안 친다.
 * 15자를 넘으면 검색광고가 힌트를 잘라 남의 연관어를 주므로 수식어부터 뺀다.
 */
export function productCoreKeyword(name: string): string {
    const head = String(name || '').split(',')[0]!.replace(/\[[^\]]*\]/g, ' ').trim();
    const tokens = head.split(/\s+/).filter((token) => token.length > 1);
    if (tokens.length === 0) return '';
    if (tokens.length <= 2) return tokens.join(' ');

    const brand = tokens[0]!;
    const category = findCategory(tokens.slice(1));
    if (!category) {
        // 사전에 없는 품목 — 옛 규칙(뒤쪽 의미 어절)으로 떨어뜨린다.
        const meaningful = tokens.slice(1).filter((token) => !isModelToken(token) && !COLOR.test(token));
        const tail = meaningful.slice(-2);
        const fallback = [brand, ...tail].join(' ');
        return fallback.replace(/\s+/g, '').length > 15 ? `${brand} ${tail[tail.length - 1] ?? ''}`.trim() : fallback;
    }

    const absoluteIndex = category.index + 1;
    const previous = tokens[absoluteIndex - 1];
    const modifier = previous && previous !== brand && !isModelToken(previous) && !COLOR.test(previous)
        ? previous : '';

    const withModifier = [brand, modifier, category.word].filter(Boolean).join(' ');
    if (withModifier.replace(/\s+/g, '').length <= 15) return withModifier;
    return `${brand} ${category.word}`;
}
