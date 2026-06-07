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

const POLICY_INTENT_PATTERNS = [
    '신청방법', '자격', '대상', '혜택', '지원내용', '지원금액', '조건', '신청기간',
    '지급일', '서류', '필요서류', '조회', '마감', '온라인 신청', '문의처', '전화번호',
    '선정기준', '소득기준', '중복 지원', '제외 대상', '변경사항'
];

const INCIDENT_INTENT_PATTERNS = [
    '확인', '피해 확인', '피해 조회', '공지', '보상', '대응', '대처', '원인',
    '고객센터', '신고', '비밀번호 변경', '계정 보호', '2차 피해', '피싱 문자', '스미싱'
];

const ENTERTAINMENT_INTENT_PATTERNS = [
    '공식입장', '근황', '인스타', '출연', '방송시간', '다시보기', '일정',
    '팬미팅', '콘서트', '예매', '라인업', '반응', '해명', '프로필'
];

const SPORTS_INTENT_PATTERNS = [
    '중계', '경기일정', '티켓팅 일정', '예매', '라인업', '순위',
    '선발', '하이라이트', '직관 준비물', '일정', '결과', '부상 소식'
];

function compact(value: string): string {
    return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function getDomainIntentPatterns(base: string): string[] | null {
    const kw = compact(base);
    if (/지원금|보조금|장려금|바우처|급여|수당|환급|감면|정책|복지|정부24|보조금24|정책브리핑/.test(kw)) {
        return POLICY_INTENT_PATTERNS;
    }
    if (/정보유출|개인정보|유출|해킹|보안사고|침해|피싱|스미싱|랜섬웨어|도용|사칭|2차피해|피해확인|보상|환불|장애|먹통/.test(kw)) {
        return INCIDENT_INTENT_PATTERNS;
    }
    if (/kbo|k리그|epl|nba|mlb|프로야구|야구|축구|농구|골프|테니스|월드컵|올스타전|개막전|결승전|스포츠/.test(kw)) {
        return SPORTS_INTENT_PATTERNS;
    }
    if (/아이돌|배우|가수|연예인|스타|걸그룹|보이그룹|컴백|공식입장|팬미팅|콘서트|시상식|드라마|예능|출연|열애|결혼|논란/.test(kw)) {
        return ENTERTAINMENT_INTENT_PATTERNS;
    }
    return null;
}

function isBlockedDomainSuffix(domainPatterns: string[] | null, suffix: string): boolean {
    if (!domainPatterns) return false;
    const compactSuffix = compact(suffix);
    if (!compactSuffix) return true;
    const commerceNoise = /(가격|추천|후기|리뷰|비교|순위|최저가|할인|구매|렌탈|대여)$/;
    if (domainPatterns === POLICY_INTENT_PATTERNS || domainPatterns === INCIDENT_INTENT_PATTERNS) {
        return commerceNoise.test(compactSuffix);
    }
    if (domainPatterns === ENTERTAINMENT_INTENT_PATTERNS) {
        return /(가격|최저가|렌탈|대여|중고)$/.test(compactSuffix);
    }
    if (domainPatterns === SPORTS_INTENT_PATTERNS) {
        return /(가격|최저가|렌탈|대여|중고|성분|부작용)$/.test(compactSuffix);
    }
    return false;
}

export function generateQueryPatterns(units: SemanticUnits, externalSuffixes: string[] = []): string[] {
    const patterns = new Set<string>();
    const { brand, product, model, target, core } = units;

    const base = core;
    const fullBase = [brand, model, core].filter(Boolean).join(' ');
    const domainPatterns = getDomainIntentPatterns(fullBase || base);

    if (base) patterns.add(base);
    if (fullBase && fullBase !== base) patterns.add(fullBase);

    // 1. 외부 신호(자동완성 등) 기반 패턴 우선 생성
    if (externalSuffixes.length > 0) {
        externalSuffixes.forEach(suf => {
            if (isBlockedDomainSuffix(domainPatterns, suf)) return;
            patterns.add(`${base} ${suf}`.trim());
            if (fullBase !== base) patterns.add(`${fullBase} ${suf}`.trim());
        });
    }

    // 2. 기본 인텐트 조합 (Base + Intent)
    (domainPatterns || Object.values(INTENT_PATTERNS).flat()).forEach(suffix => {
        patterns.add(`${base} ${suffix}`);
        if (fullBase !== base) patterns.add(`${fullBase} ${suffix}`);
    });

    // 3. 대상 조합 (Target + Base + Suffix)
    if (domainPatterns) {
        if (domainPatterns === POLICY_INTENT_PATTERNS) {
            patterns.add(`${base} 공식 발표`);
            patterns.add(`${base} 정책브리핑`);
        } else if (domainPatterns === INCIDENT_INTENT_PATTERNS) {
            patterns.add(`${base} 공식 공지`);
            patterns.add(`${base} 피해 보상`);
        } else if (domainPatterns === SPORTS_INTENT_PATTERNS) {
            patterns.add(`${base} 경기 시간`);
            patterns.add(`${base} 티켓 예매`);
        } else {
            patterns.add(`${base} 공식입장`);
            patterns.add(`${base} 반응`);
        }
    } else if (target) {
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
    if (!domainPatterns) {
        patterns.add(`가성비 ${base}`);
    }

    return Array.from(patterns).map(p => p.trim()).filter(p => p.length > 1);
}
