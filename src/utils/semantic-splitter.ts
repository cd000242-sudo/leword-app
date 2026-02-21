/**
 * Semantic Splitter Engine
 * 고유 명사, 제품군, 수식어 등을 분석하여 키워드를 의미 단위로 분해합니다.
 */

export interface SemanticUnits {
    brand?: string;     // 브랜드 (삼성, 애플, 나이키 등)
    product?: string;   // 제품군 (스마트폰, 운동화, 영양제 등)
    model?: string;     // 모델명/넘버 (S24, 15 Pro, 맥스 등)
    target?: string;    // 대상 (어린이용, 부모님, 여자 등)
    action?: string;    // 행동/목적 (구매, 수리, 설치 등)
    suffix?: string;    // 수식어 (추천, 가격, 후기, 방법 등)
    core: string;       // 핵심 키워드 (분해되지 않은 나머지)
}

const BRAND_LIST = [
    '삼성', 'samsung', '애플', 'apple', '나이키', 'nike', '아디다스', 'adidas', '엘지', 'lg', '샤오미', '다이슨', '소니', 'sony',
    '현대', '기아', '테슬라', '샤넬', '구찌', '프라다', '루이비통', '입생로랑', '나스', '맥', 'mac'
];
const MODEL_PATTERNS = [
    /[A-Z]{1,3}\d{1,4}[A-Z]{0,2}/i,      // S24, V50S, M3 Max 등
    /\d{1,2}(세대|Pro|Max|Air|Ultra|Plus|mini|Super|Ti)/i, // 15세대, 15 Pro, 맥스 등
    /(갤럭시|아이폰|아이패드|맥북)\s*\d+[a-z]*/i, // 갤럭시 24, 아이폰 15 등
    /\d{4}/,              // 2024 등
];
const SUFFIX_DICTIONARY = [
    '추천', '가격', '비용', '후기', '리뷰', '방법', '하는법', '꿀팁', '정리', '뜻', '의미', '효능', '효과',
    '순위', '베스트', '차이', '비교', '장단점', '구매', '구입', '할인', '직구', '수리', 'AS', '위치', '매장',
    '할인코드', '최저가', '사용법', '스펙', '성능', '해결', '연결', '초기화'
];
const TARGET_WORDS = ['어린이', '아이', '부모님', '선물', '남자', '여자', '임산부', '초보', '학생', '직장인', '노인', '강아지', '고양이'];

export function splitKeywordSemantically(keyword: string): SemanticUnits {
    const original = keyword.trim();
    const units: SemanticUnits = { core: original };

    let remaining = original;

    // 1. 브랜드 추출 (전체 문구에서 패턴 매칭)
    for (const brand of BRAND_LIST) {
        const regex = new RegExp(`(^|\\s)${brand}(\\s|$)`, 'i');
        const match = remaining.match(regex);
        if (match) {
            units.brand = brand;
            remaining = remaining.replace(regex, ' ').trim();
            break;
        }
    }

    // 2. 수식어(Suffix) 추출 - 주로 뒤에 위치하므로 역순 탐색 및 정확도 향상
    const sortedSuffixes = [...SUFFIX_DICTIONARY].sort((a, b) => b.length - a.length);
    for (const suf of sortedSuffixes) {
        if (remaining.endsWith(suf)) {
            units.suffix = suf;
            remaining = remaining.replace(new RegExp(`\\s*${suf}$`), '').trim();
            break;
        }
    }

    // 3. 대상(Target) 추출
    for (const target of TARGET_WORDS) {
        if (remaining.includes(target)) {
            units.target = target;
            remaining = remaining.replace(target, '').trim();
            break;
        }
    }

    // 4. 모델명 패턴 추출 (정규표현식 매칭)
    for (const pattern of MODEL_PATTERNS) {
        const match = remaining.match(pattern);
        if (match) {
            units.model = match[0];
            remaining = remaining.replace(match[0], '').trim();
            break;
        }
    }

    // 최종 정제: 공백 제거 및 연속된 공백 처리
    units.core = remaining.replace(/\s+/g, ' ').trim() || original;

    return units;
}
