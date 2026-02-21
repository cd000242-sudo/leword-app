import { SemanticUnits } from './semantic-splitter';

/**
 * Pattern Generator Engine
 * 분해된 의미 단위들을 조합하여 검색 엔진 최적화(SEO) 및 발굴용 쿼리 패턴을 생성합니다.
 */

const INTENT_PATTERNS = {
    COMMERCIAL: ['가격', '비용', '할인', '최저가', '공구', '중고', '매장', '파는곳', '렌탈', '대여'],
    INFORMATIONAL: ['뜻', '의미', '효능', '효과', '성분', '부작용', '정리', '팁', '꿀팁', '노하우', '장단점'],
    TRANSACTIONAL: ['추천', '순위', '베스트', '리뷰', '후기', '비교', '차이점', '구매가이드', '사용기', '내돈내산'],
    HOWTO: ['방법', '하는법', '설치', '조립', '수리', 'AS', '해결', '연결', '설정', '초기화'],
    LOCATIONAL: ['근처', '주변', '위치', '지도', '가는법', '영업시간', '주차']
};

export function generateQueryPatterns(units: SemanticUnits, externalSuffixes: string[] = []): string[] {
    const patterns = new Set<string>();
    const { brand, product, model, target, core } = units;

    const base = core;
    const fullBase = [brand, model, core].filter(Boolean).join(' ');

    // 1. 외부 신호(자동완성 등) 기반 패턴 우선 생성
    if (externalSuffixes.length > 0) {
        externalSuffixes.forEach(suf => {
            patterns.add(`${base} ${suf}`.trim());
            if (fullBase !== base) patterns.add(`${fullBase} ${suf}`.trim());
        });
    }

    // 2. 기본 인텐트 조합 (Base + Intent)
    Object.values(INTENT_PATTERNS).flat().forEach(suffix => {
        patterns.add(`${base} ${suffix}`);
        if (fullBase !== base) patterns.add(`${fullBase} ${suffix}`);
    });

    // 3. 대상 조합 (Target + Base + Suffix)
    if (target) {
        patterns.add(`${target} ${base}`);
        patterns.add(`${target} ${base} 추천`);
        patterns.add(`${target} ${base} 선물`);
    } else {
        ['초보', '입문', '직장인', '학생'].forEach(t => {
            patterns.add(`${t} ${base}`);
            patterns.add(`${t} ${base} 추천`);
        });
    }

    // 4. 연도별/가성비 패턴
    const currentYear = new Date().getFullYear();
    patterns.add(`${currentYear} ${base}`);
    patterns.add(`${base} ${currentYear}`);
    patterns.add(`가성비 ${base}`);

    return Array.from(patterns).map(p => p.trim()).filter(p => p.length > 1);
}
