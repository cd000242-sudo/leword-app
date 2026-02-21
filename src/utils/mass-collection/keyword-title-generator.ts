/**
 * ✍️ 킬러 타이틀 생성기 (Killer Title Generator) - v3.0 100점 에디션
 * 
 * 발굴된 키워드를 바탕으로 클릭률(CTR)이 높은 매력적인 제목을 자동으로 생성합니다.
 * 스마트블록 분석 결과(인물, 장소, 드라마, 정책 등)를 반영하여 문맥에 맞는 제목을 제공합니다.
 * 
 * 🆕 v3.0: 네이버 연관검색어 실시간 API 통합
 */

import { FreshKeyword } from './fresh-keywords-api';
import axios from 'axios';

// ============================================================================
// 인터페이스 및 타입 데이터
// ============================================================================

// Window 인터페이스 확장 (electronAPI 인식용)
declare global {
    interface Window {
        electronAPI: {
            crawlNewsSnippets(keyword: string): Promise<string[]>;
            fetchRealRelatedKeywords(keyword: string): Promise<string[]>;
        };
    }
}

export type SmartBlockType =
    | 'person'      // 인물 (프로필, 근황, 나이)
    | 'place'       // 장소 (맛집, 카페, 여행지)
    | 'movie'       // 영화/드라마 (결말, 출연진)
    | 'product'     // 제품 (가격, 스펙, 후기)
    | 'policy'      // 정책 (신청방법, 자격)
    | 'stock'       // 주식 (전망, 관련주)
    | 'health'      // 건강 (효능, 부작용)
    | 'issue'       // 이슈/사건 (비보, 사고, 논란)
    | 'general';    // 일반

export interface TitleTemplate {
    templates: string[];
}

// ============================================================================
// 카테고리별 훅(Hook) 데이터
// ============================================================================

const HOOKS = {
    // 일반적인 추천/정리용 (Default)
    common: ['꿀팁', '노하우', '총정리', '완벽 가이드', '2025 최신', '실제 후기', '팩트체크', '정리'],
    // 강조/경고 (주의 필요 시)
    strong: ['충격', '경악', '긴급', '필독', '주의', '현실', '소름'],
    // 이슈/비보 (이슈 발생 시에만 한정 사용)
    issue: ['안타까운 비보', '추모', '별세', '단독', '화제', '진실', '명복'],
    // 이득/혜택
    benefit: ['무료', '할인', '최저가', '환급', '지원금'],
    // 호기심
    curiosity: ['이유', '비밀', '혹시', '설마', '나만 몰랐던', '의외의'],
    // 감정/공감
    emotion: ['대박', '역대급', '미쳤다', '인생'],
    // 뉴스/속보
    news: ['속보', '단독', '화제', '실시간', '근황', '결과']
};

// ============================================================================
// 스마트블록 타입별 템플릿 (v2.0 New!)
// ============================================================================

const SMART_TEMPLATES: Record<SmartBlockType, string[]> = {
    // 👤 인물 Smart Block (연예인, 유명인)
    person: [
        "{keyword} 프로필/나이/가족관계 완벽 정리 (사진 O)",
        "{keyword} 근황, 최근 활동 및 차기작 소식 모음",
        "[화제] {keyword} 관련 논란/이슈 진실은? (팩트체크)",
        "{keyword} 리즈 시절 vs 현재 비교 (Feat. 작품활동)",
        "{keyword} 결혼/배우자/자녀 정보 공개",
        "{keyword} MBTI 성격 및 TMI 대방출"
    ],

    // 🚨 이슈/사건 Smart Block (비보, 사고, 중대 발표)
    issue: [
        "[속보] {keyword} 안타까운 비보... 사망 원인 및 현재 상황",
        "{keyword} 별세 소식에 동료들 추모 물결 (근황/나이)",
        "충격적인 {keyword} 급작스러운 사망, 무슨 일이 있었나?",
        "{keyword} 향년 {age}세로 별세, 마지막 남긴 말은?",
        "[단독] {keyword} 관련 공식 입장 발표내용 정리 (팩트체크)",
        "{keyword} 비보에 팬들 슬픔... 리즈 시절 다시보기"
    ],

    // 📍 장소 Smart Block (맛집, 카페, 핫플)
    place: [
        "{keyword} 내돈내산 솔직 후기 (메뉴/가격/주차)",
        "{keyword} 방문 전 필수 꿀팁! (웨이팅 없이 가는 법)",
        "[현지인 추천] {keyword} 주변 맛집/놀거리 코스",
        "{keyword} 솔직히 재방문 할까? (장단점 총정리)",
        "{keyword} 가성비 최고! 분위기 좋은 데이트 코스",
        "{keyword} 주차장/영업시간/예약 꿀팁 A to Z"
    ],

    // 🎬 영화/드라마 Smart Block
    movie: [
        "{keyword} 결말 해석 & 줄거리 요약 (스포 주의!)",
        "{keyword} 출연진/등장인물 관계도 완벽 분석",
        "{keyword} 평점/후기 모음 (볼까 말까 고민된다면?)",
        "{keyword} 시즌2 제작 확정? 공개일 및 떡밥 정리",
        "{keyword} 명대사/명장면 BEST 5 다시보기",
        "{keyword} 원작 웹툰/소설과 차이점 비교"
    ],

    // 📦 제품 Smart Block (IT기기, 밀키트 등)
    product: [
        "{keyword} 내돈내산 2주 사용기 (장점 vs 단점)",
        "{keyword} 최저가 구매 좌표 & 할인 꿀팁 공유",
        "{keyword} 스펙/성능 비교 분석 (가성비 끝판왕은?)",
        "지금 '{keyword}' 사도 될까? 솔직 비추천 후기",
        "{keyword} 사용법 및 숨겨진 기능 대방출",
        "{keyword} vs 경쟁 모델 철저 비교 (승자는?)"
    ],

    // 📜 정책/지원금 Smart Block (국세청, 보조금 등)
    policy: [
        "{keyword} 신청 방법 및 자격 조건 (2025 최신판)",
        "[긴급] {keyword} 신청 마감 임박! 지금 바로 조회하세요",
        "{keyword} 환급금 조회/신청 바로가기 (안 받으면 손해)",
        "{keyword} 대상자 조회 & 제외 조건 총정리",
        "{keyword} 필수 서류 및 신청 절차 A to Z",
        "{keyword} 지급일 및 금액 조회 방법 (모바일 가능)"
    ],

    // 📈 주식/투자 Smart Block
    stock: [
        "{keyword} 주가 전망 및 목표가 분석 (전문가 의견)",
        "{keyword} 관련주/대장주 TOP 3 및 상승 이유",
        "[속보] {keyword} 실적 발표 및 향후 호재 정리",
        "{keyword} 배당금 조회 및 지급일 확인 방법",
        "{keyword} 차트 분석: 지금이 매수 타이밍? (손절가 포함)",
        "{keyword} 3분기 실적 쇼크? 주가 영향 분석"
    ],

    // 💊 건강/질병 Smart Block
    health: [
        "{keyword} 초기 증상 및 자가진단 체크리스트",
        "{keyword} 효능/효과 진짜 있을까? (논문 근거)",
        "{keyword} 부작용 주의! 섭취 전 필독 사항",
        "{keyword} 치료 방법 및 수술 비용/후기 정리",
        "{keyword} 추천 음식 vs 피해야 할 음식 가이드",
        "의사가 말하는 {keyword} 예방법 및 관리 루틴"
    ],

    // 🌐 일반 (기존 템플릿 개선)
    general: [
        "{keyword} 뜻/유래 완벽 정리 (쉽게 설명해드림)",
        "{keyword} 하는 법 & 이용 꿀팁 총정리",
        "{keyword} 추천 순위 BEST 5 (2025년 버전)",
        "{keyword} 논란/이슈 요약 (3줄 요약)",
        "{keyword} 관련 자주 묻는 질문(FAQ) 해결",
        "{keyword} 팩트체크: 진짜일까? (오해와 진실)"
    ]
};

// ============================================================================
// 기존 단순 카테고리 템플릿 (Fallback용)
// ============================================================================
const OLD_CATEGORY_TEMPLATES: Record<string, string[]> = {
    finance: SMART_TEMPLATES.policy.concat(SMART_TEMPLATES.stock),
    policy: SMART_TEMPLATES.policy,
    stock: SMART_TEMPLATES.stock,
    realestate: SMART_TEMPLATES.policy.concat(SMART_TEMPLATES.place), // 부동산은 정책+장소
    insurance_safe: SMART_TEMPLATES.stock.concat(SMART_TEMPLATES.policy),
    sidejob: SMART_TEMPLATES.general,
    marketing: SMART_TEMPLATES.product.concat(SMART_TEMPLATES.general),
    it: SMART_TEMPLATES.product,
    health: SMART_TEMPLATES.health,
    life_tips: SMART_TEMPLATES.place,
    game: [
        "{keyword} 공략! 초보자도 쉽게 따라하는 꿀팁",
        "{keyword} 무과금/소과금 필수 가이드 (티어표 포함)",
        "{keyword} 사기 직업/아이템 추천! 안 쓰면 손해",
        "{keyword} 업데이트 내용 총정리 & 떡상 예상"
    ],
    car: SMART_TEMPLATES.product,
    fashion: SMART_TEMPLATES.product.concat(["{keyword} 코디 모음! 올 시즌 트렌드"]),
    pet: [
        "수의사가 알려주는 {keyword} 주의사항",
        "{keyword} 기호성 테스트! 우리 댕댕이가 환장해요",
        "{keyword} 추천! 가성비 & 성분 비교 분석"
    ]
};


// ============================================================================
// ============================================================================
// TitleGenerator 클래스 (데이터 기반 지능형 엔진)
// ============================================================================

export class TitleGenerator {

    /**
     * [v15.2 Specialist Edition]
     * 비평가적 관점에서 키워드의 지표와 급상승 원인을 종합 분석하여 리포트를 생성합니다.
     */
    analyzeGoldenBackground(keyword: FreshKeyword): string {
        const sv = keyword.searchVolume || 0;
        const dc = keyword.documentCount || 0;
        const ratio = keyword.goldenRatio || 0;
        const isRising = keyword.isRising;
        const reason = keyword.trendingReason;
        const kw = keyword.keyword;

        // 🚨 1순위: 사회적 이슈/비보 컨텍스트 분석
        const textToAnalyze = (kw + (reason || "")).replace(/\s/g, "");
        const isTragedy = /사망|별세|비보|고인|추모|숨진채|사건|사고/.test(textToAnalyze);

        if (isTragedy) {
            // 🎯 사람들이 실제로 궁금해하는 연관 키워드 추천
            const baseName = kw.replace(/\s*(사망|별세|비보|사고|추모|숨진채).*$/g, '').trim();
            const relatedKeywords = [
                `${baseName} 사망원인`,
                `${baseName} 부고장`,
                `${baseName} 프로필`,
                `${baseName} 나이`,
                `${baseName} 마지막 영상`,
                `${baseName} 추모`
            ];
            const detail = reason ? `📰 배경: ${reason}` : "";
            const relatedStr = relatedKeywords.slice(0, 5).map(k => `"${k}"`).join(', ');

            return `[비평가 분석] "${kw}" 키워드가 SV ${sv.toLocaleString()}로 폭발한 배경은 비보/사건 이슈입니다. ${detail}\n\n🔥 지금 사람들이 궁금해하는 연관 키워드: ${relatedStr}\n\n💡 공략 포인트: 위 연관 키워드를 제목/본문에 자연스럽게 녹여 작성하세요. 정확한 사실 확인과 예우를 갖춘 콘텐츠가 블로그 지수와 신뢰도 모두 잡는 100점짜리 선택입니다.`;
        }

        // 🔍 2순위: 데이터 기반 시장성 비평 + 연관 키워드 추천
        let critique = "";
        const nicheType = keyword.nicheInfo?.type;
        const category = keyword.category || 'general';

        // 카테고리별 연관 키워드 패턴 (100점짜리 비평가 에디션)
        // 🎯 기준: 실제 검색 수요 + 클릭 유발 + 수익화 가능성
        const relatedByCategory: Record<string, string[]> = {
            // === 엔터테인먼트·예술 ===
            // 📖 책: 독자들이 구매 전 가장 궁금해하는 것
            'book': ['줄거리', '결말 해석', '등장인물 관계도', '작가 신작', '독후감'],
            // 🎬 영화: 관람 전후로 검색하는 핵심 키워드
            'movie': ['결말 해석', '쿠키영상', '출연진 캐스팅', '평점 후기', 'OTT 다시보기'],
            // 📺 드라마: 시청자들의 덕후 심리 자극
            'drama': ['결말 떡밥', '등장인물 관계도', 'OST 전곡', '몇부작', '시즌2 제작'],
            // 🎵 음악: 팬심 + 정보 검색
            'music': ['가사 해석', '뮤비 촬영지', '콘서트 티켓팅', '앨범 트랙리스트', '멤버 프로필'],
            // ⭐ 연예인: 이슈별 세분화 (일반/비보/논란)
            'celeb': ['프로필 나이', '결혼 배우자', '최근 근황', '과거 작품', '인스타그램'],
            // 🎌 애니: 덕후 검색 패턴
            'anime': ['결말 스포', '시즌2 방영일', '성우진', '원작 차이점', '굿즈 구매'],
            // 📡 방송: 시청자 편의 + 논란 추적
            'broadcast': ['다시보기 링크', '편성 시간표', '출연진 게스트', '시청률 순위', '논란 정리'],
            // 🎨 미술·디자인: 전시 관람객 니즈
            'art': ['전시 기간', '입장료 할인', '작가 인터뷰', '작품 의미 해석', '포토존'],
            // 🎭 공연·전시: 티켓팅 전쟁 대비
            'performance': ['티켓 예매 링크', '좌석 시야', '런타임', '캐스팅 스케줄', '커튼콜'],

            // === 생활·노하우·쇼핑 ===
            // 📝 일상: 공감형 + 정보형
            'daily': ['꿀팁 정리', '실제 후기', '비용 절약', '추천 리스트', '주의사항'],
            // 💡 생활꿀팁: 문제 해결 중심
            'life_tips': ['하는 법', '쉬운 방법', '주의사항', '비용 절감', '전문가 팁'],
            // 👶 육아·결혼: 단계별 정보
            'parenting': ['개월별 가이드', '추천 제품', '비용 정리', '실제 후기', '꿀팁'],
            // 🐕 반려동물: 보호자의 걱정 해결
            'pet': ['사료 추천 순위', '병원 비용', '훈련 방법', '수명 늘리는법', '보험 비교'],
            // 👗 패션·미용: 구매 전 필수 정보
            'fashion': ['코디 추천', '사이즈 표', '최저가 구매', '실착 후기', '트렌드 2025'],
            // 🏠 인테리어·DIY: 실행 가능한 정보
            'interior': ['셀프 방법', '업체 견적', '비용 총정리', '시공 후기', '인테리어 팁'],
            // 🍳 요리·레시피: 따라하기 쉬운 형태
            'recipe': ['황금 레시피', '재료 손질법', '칼로리 정보', '보관 방법', '맛집 비교'],
            // 📦 상품리뷰: 구매 결정 도움
            'product': ['장단점 솔직후기', '최저가 비교', '할인 쿠폰', '1년 사용기', '대안 추천'],
            // 🌱 원예·재배: 식물 케어 완벽 가이드
            'gardening': ['키우는 법', '물주기 주기', '분갈이 시기', '병충해 대처', '겨울나기'],

            // === 취미·여가·여행 ===
            // 🎮 게임: 게이머 필수 검색
            'game': ['공략 가이드', '티어표 메타', '패치노트', '무과금 팁', 'PC 스펙'],
            // ⚽ 스포츠: 팬 + 베팅 정보
            'sports': ['경기 일정', '무료 중계', '선수 연봉', '순위표', '하이라이트 영상'],
            // 📷 사진: 촬영 실력 향상
            'photo': ['카메라 설정값', '보정 앱 추천', '출사 스팟', '장비 추천', '구도 팁'],
            // 🚗 자동차: 구매자 의사결정
            'car': ['실구매가', '풀옵션 스펙', '실연비 후기', '단점 총정리', '출시일 예상'],
            // 🎯 취미: 입문자 중심
            'hobby': ['입문 가이드', '추천 장비', '비용 얼마', '독학 방법', '커뮤니티'],
            // 🗺️ 국내여행: 여행자 필수 정보
            'travel_domestic': ['맛집 추천', '코스 일정', '숙소 가성비', '가는 법', '입장료 할인'],
            // ✈️ 해외여행: 준비물 체크리스트
            'travel_overseas': ['항공권 특가', '숙소 예약', '여행 경비', '필수 코스', '비자 발급'],
            // 🍜 맛집: 방문 전 체크
            'food': ['메뉴 추천', '가격대', '웨이팅 시간', '주차 가능', '예약 방법'],

            // === 지식·동향 ===
            // 💻 IT·컴퓨터: 구매 + 사용 정보
            'it': ['스펙 비교', '최저가 구매', '실사용 후기', '단점 총정리', '출시일 루머'],
            // 📱 전자제품: 스마트 소비자용
            'electronics': ['스펙 비교표', '할인 정보', '실사용 후기', '단점 정리', '대안 추천'],
            // 🏛️ 사회·정치: 이슈 추적
            'politics': ['논란 정리', '발언 전문', '이력 총정리', '지지율 변화', '공약 비교'],
            // 💊 건강·의학: 신뢰도 중심
            'health': ['효능 효과', '부작용 주의', '복용법 용량', '가격 비교', '전문가 의견'],
            // 💰 비즈니스·경제: 실용 정보
            'finance': ['신청 방법', '금리 비교', '조건 총정리', '후기 장단점', '대출 한도'],
            // 🌍 어학·외국어: 학습자 니즈
            'language': ['독학 방법', '교재 추천', '무료 강의', '시험 일정', '합격 후기'],
            // 🎓 교육·학문: 진로 결정
            'education': ['커리큘럼', '등록금 장학금', '취업률 현실', '입시 전략', '후기 평판'],
            // 🏢 부동산: 투자 + 실거주
            'realestate': ['시세 전망', '매물 검색', '청약 일정', '분양가 비교', '실거주 후기'],
            // 📈 자기계발: 실천 가능형
            'selfdev': ['시작 방법', '추천 강의', '자격증 난이도', '합격 후기', '취업 연계'],
            // 📋 정책·지원금: 신청자 필수
            'policy': ['신청 방법 총정리', '자격 조건 확인', '지급일 언제', '필요 서류', '대상자 조회'],

            // 기본값 (모든 상황 대응)
            'general': ['하는 방법', '후기 장단점', '가격 비용', '추천 순위', '주의사항']
        };

        // 🎯 100점짜리 동적 연관 키워드 생성 시스템
        // 키워드 특성과 이슈 맥락을 분석하여 자연스러운 형태로 생성

        const baseKw = this.extractBaseName(kw);
        const issueType = this.detectIssueType(kw, reason);
        const relatedKws = this.generateSmartRelatedKeywords(baseKw, kw, category, issueType);
        const relatedStr = relatedKws.map(k => `"${k}"`).join(', ');

        // 🔥 배경 추론: reason이 비었으면 키워드 패턴에서 왜 뜨는지 자동 추론
        const inferredBackground = this.inferKeywordBackground(kw, sv, dc, ratio, category);
        const backgroundText = reason || inferredBackground;

        if (nicheType === 'empty_house') {
            critique = `[비평가 분석] 정보 비대칭이 극대화된 '빈집털이' 키워드입니다. SV ${sv.toLocaleString()} 대비 문서 ${dc.toLocaleString()}개 미만.${backgroundText ? `\n\n📰 배경 분석: ${backgroundText}` : ''}\n\n🔥 지금 공략해야 할 연관 키워드:\n${relatedKws.map((k, i) => `   ${i + 1}. ${k}`).join('\n')}\n\n💡 선점 전략: 위 키워드를 H2 소제목으로 사용하면 롱테일 트래픽까지 흡수합니다.`;
        } else if (nicheType === 'gold_mine') {
            critique = `[비평가 분석] SSS급 '골든 마켓'. 경쟁률 ${ratio.toFixed(2)}로 저항이 거의 없습니다.${backgroundText ? `\n\n📰 배경 분석: ${backgroundText}` : ''}\n\n🔥 지금 공략해야 할 연관 키워드:\n${relatedKws.map((k, i) => `   ${i + 1}. ${k}`).join('\n')}\n\n💡 수익화 팁: 구매 의도가 높은 키워드(가격, 후기, 최저가)를 섞어 쿠팡파트너스 전환율을 높이세요.`;
        } else if (isRising || keyword.isEarlyBird) {
            critique = `[비평가 분석] '${backgroundText || '새로운 화두'}'로 인한 초기 폭발 국면입니다.\n\n🔥 지금 공략해야 할 연관 키워드:\n${relatedKws.map((k, i) => `   ${i + 1}. ${k}`).join('\n')}\n\n💡 속도 전략: 지금 바로 발행하고, 위 연관 키워드로 후속 글을 올리면 카테고리 권위자가 됩니다.`;
        } else if (ratio > 5.0) {
            critique = `[비평가 분석] 안정적 수요 + 낮은 경쟁의 '고효율 세그먼트'.${backgroundText ? `\n\n📰 배경 분석: ${backgroundText}` : ''}\n\n🔥 지금 공략해야 할 연관 키워드:\n${relatedKws.map((k, i) => `   ${i + 1}. ${k}`).join('\n')}\n\n💡 롱테일 전략: 메인 키워드로 첫 글을 쓰고, 연관 키워드로 시리즈를 만드세요.`;
        } else {
            critique = `[비평가 분석] 안정된 시장입니다.${backgroundText ? `\n\n📰 배경 분석: ${backgroundText}` : ''}\n\n🔥 지금 공략해야 할 연관 키워드:\n${relatedKws.map((k, i) => `   ${i + 1}. ${k}`).join('\n')}\n\n💡 차별화 전략: "2025 최신", "초보자용", "비교분석" 같은 수식어로 틈새를 파고드세요.`;
        }

        return critique;
    }

    /**
     * 🔥 키워드 패턴 기반 배경 추론
     * reason이 비었을 때 키워드 자체를 분석하여 왜 사람들이 검색하는지 설명
     */
    private inferKeywordBackground(kw: string, sv: number, dc: number, ratio: number, category: string): string {
        const text = kw.replace(/\s/g, '').toLowerCase();

        // 주식/금융 관련
        if (/주가|목표주가|전망|주가전망/.test(text)) {
            return `"${kw.split(' ')[0]}" 관련 투자자들의 주가 전망 검색이 급증하고 있습니다. 기관/외인 수급, 실적 발표, 시장 이슈 등이 원인일 수 있습니다.`;
        }
        if (/배당금|배당일|배당락/.test(text)) {
            return `배당 시즌에 맞춰 배당금 및 지급일 관련 검색이 증가합니다. 투자자들이 배당 투자 결정 전 정보를 수집하는 단계입니다.`;
        }
        if (/삼성전자|반도체|sk하이닉스|한미반도체/.test(text)) {
            return `반도체 업황 관련 관심이 급증 중입니다. AI/HBM 수요, 실적 발표, 수출 통계 등 거시 이슈가 배경일 가능성이 높습니다.`;
        }

        // 청약/부동산
        if (/청약|분양|입주자모집/.test(text)) {
            return `청약 일정이 다가오면서 관심 지역의 분양가, 경쟁률, 당첨 전략 등의 검색이 폭발합니다.`;
        }

        // 정책/지원금
        if (/지원금|신청|바우처|청년/.test(text)) {
            return `정부 지원 정책 발표 시점에 자격 조건, 신청 방법, 지급일 등의 정보 검색이 급증합니다.`;
        }

        // 제품/가전
        if (/추천|비교|가성비|후기|리뷰/.test(text)) {
            return `구매 결정 직전 단계의 검색입니다. "어떤 제품이 좋을까?" 고민하는 소비자들이 타겟입니다.`;
        }
        if (/청소기|냉장고|에어컨|에어프라이어/.test(text)) {
            return `가전 구매 시즌(이사철, 명절 등)에 맞춰 비교/추천 검색이 증가합니다.`;
        }

        // 일반적인 높은 수요
        if (sv >= 10000) {
            return `월 ${sv.toLocaleString()}회 이상 검색되는 고수요 키워드입니다. 많은 사람들이 관련 정보를 찾고 있습니다.`;
        }
        if (ratio >= 2.0 && dc < 5000) {
            return `검색량 대비 경쟁 문서가 적어 상위 노출 가능성이 높습니다. 초보 블로거도 충분히 공략 가능한 틈새입니다.`;
        }
        if (dc < 1000) {
            return `문서수 ${dc.toLocaleString()}개로 경쟁이 거의 없는 빈집 상태입니다. 양질의 콘텐츠 하나로 상위권 진입이 가능합니다.`;
        }

        return `최근 "${kw}" 등의 정보를 찾는 검색 수요가 꾸준합니다.`;
    }

    /**
     * 키워드에서 베이스 이름 추출 (이슈 키워드 제거)
     */
    private extractBaseName(kw: string): string {
        return kw.replace(/\s*(사망|별세|비보|사고|추모|논란|열애|결혼|이혼|복귀|은퇴|컴백|탈퇴|방법|하는법|꿀팁|추천|가격|후기|비용).*$/g, '').trim() || kw.split(' ')[0];
    }

    /**
     * 이슈 타입 감지 (비보/논란/연애/일반)
     */
    private detectIssueType(kw: string, reason?: string): 'tragedy' | 'scandal' | 'romance' | 'comeback' | 'product' | 'howto' | 'general' {
        const text = (kw + (reason || '')).replace(/\s/g, '');

        // 비보/사망 패턴
        const tragedyPatterns = /사망|별세|비보|고인|추모|숨진채|사건|사고|부고/;

        // 1. 키워드 자체에 비보 관련 단어가 있는 경우 최우선
        if (tragedyPatterns.test(kw)) return 'tragedy';

        // 2. 뉴스/연관어 텍스트 분석
        // 시스템 노이즈가 아닌 실제 정보성 텍스트에서 패턴 발견 시
        const isTragedyMatch = tragedyPatterns.test(text);
        if (isTragedyMatch && !text.includes('검색어도움말')) return 'tragedy';

        if (/논란|폭로|학폭|사과|해명|고소/.test(text)) return 'scandal';
        if (/열애|결혼|이혼|연인|교제|남편|아내|배우자|와이프|신랑|신부|임신|출산|아기|자녀/.test(text)) return 'romance';
        if (/컴백|복귀|은퇴|탈퇴|재계약/.test(text)) return 'comeback';
        if (/가격|후기|추천|비교|최저가|구매|비용|얼마/.test(text)) return 'product';
        if (/방법|하는법|꿀팁|만들기|설정/.test(text)) return 'howto';
        return 'general';
    }

    /**
     * 맥락 기반 스마트 연관 키워드 생성
     */
    private generateSmartRelatedKeywords(baseName: string, fullKw: string, category: string, issueType: string): string[] {
        // 이슈 타입별 우선 패턴
        const issuePatterns: Record<string, string[]> = {
            'tragedy': ['사망원인', '향년 나이', '프로필', '마지막 모습', '추모 반응'],
            'scandal': ['논란 정리', '사과문 전문', '피해자 증언', '소속사 입장', '과거 발언'],
            'romance': ['열애 상대', '나이 차이', '만남 계기', '결혼 계획', '전 연인'],
            'comeback': ['컴백 일정', '신곡 티저', '앨범 트랙리스트', '활동 계획', '과거 히트곡'],
            'product': ['실사용 후기', '장단점 정리', '최저가 비교', '할인 정보', '대안 추천'],
            'howto': ['쉬운 방법', '초보자 가이드', '주의사항', '필요 도구', '전문가 팁']
        };

        // 카테고리별 기본 패턴 (개선된 자연스러운 형태)
        const categoryPatterns: Record<string, string[]> = {
            'celeb': ['나이', '키 몸무게', '학력', '데뷔', '인스타'],
            'movie': ['결말 해석', '쿠키 영상', '출연진', '평점', '다시보기'],
            'drama': ['몇부작', '결말', 'OST', '시청률', '시즌2'],
            'game': ['티어표', '공략', '패치노트', '스펙', '캐릭터'],
            'it': ['스펙', '가격', '출시일', '후기', '단점'],
            'health': ['효능', '부작용', '복용법', '가격', '추천'],
            'travel_domestic': ['맛집', '숙소', '코스', '가는법', '입장료'],
            'food': ['메뉴', '가격', '웨이팅', '주차', '예약'],
            'policy': ['신청방법', '자격조건', '지급일', '서류', '대상자'],
            'life_tips': ['하는법', '꿀팁', '주의사항', '비용', '후기']
        };

        // 이슈 타입 패턴이 있으면 우선 적용
        let patterns = issuePatterns[issueType] || categoryPatterns[category] || categoryPatterns['life_tips'];

        // 자연스러운 형태로 조합
        return patterns.map(p => {
            // 이미 베이스에 포함된 단어는 제외
            if (fullKw.includes(p)) return null;
            // 자연스러운 형태로 조합
            return `${baseName} ${p}`;
        }).filter(k => k !== null) as string[];
    }

    /**
     * 🔥 100점짜리 핵심 기능: 네이버 연관검색어 실시간 API 호출
     * 실제 네이버에서 사람들이 검색하는 연관 키워드를 가져옵니다.
     */
    async fetchRealRelatedKeywords(keyword: string): Promise<string[]> {
        try {
            // Renderer process: use IPC
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.fetchRealRelatedKeywords) {
                return await window.electronAPI.fetchRealRelatedKeywords(keyword);
            }

            // Main process (Node.js): execute directly
            const response = await axios.get('https://ac.search.naver.com/nx/ac', {
                params: {
                    q: keyword,
                    con: 1,
                    frm: 'nv',
                    ans: 2,
                    r_format: 'json',
                    r_enc: 'UTF-8'
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                },
                timeout: 3000
            });

            const results: string[] = [];
            if (response.data?.items) {
                for (const itemGroup of response.data.items) {
                    if (Array.isArray(itemGroup)) {
                        for (const item of itemGroup) {
                            if (Array.isArray(item) && item[0]) {
                                const kw = String(item[0]).trim();
                                if (kw.length >= 2 && kw !== keyword) results.push(kw);
                            }
                        }
                    }
                }
            }
            return [...new Set(results)].slice(0, 10);
        } catch (e) {
            console.error(`[Related Fetch] Failed for ${keyword}`, e);
            return [];
        }
    }


    /**
     * 🔥 100점짜리 핵심 기능 2: 실시간 뉴스 스니펫 크롤링 (Puppeteer)
     * 퍼푸티어를 사용하여 렌더러의 보안 제약 없이 정확한 데이터를 가져옵니다.
     */
    async fetchNewsSnippets(keyword: string): Promise<string[]> {
        try {
            // Renderer process: use IPC
            if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.crawlNewsSnippets) {
                return await window.electronAPI.crawlNewsSnippets(keyword);
            }

            // Main process (Node.js): execute directly
            // Note: Dynamic import to avoid bundling issues in Renderer
            const { crawlNewsSnippets } = require('../keyword-competition/naver-search-crawler');
            return await crawlNewsSnippets(keyword);
        } catch (e) {
            console.error(`[News Fetch] Failed for ${keyword}`, e);
            return [];
        }
    }

    /**
     * 🎯 100점짜리 비동기 황금 배경 분석 (뉴스 + 연관검색어 하이브리드)
     */
    async analyzeGoldenBackgroundAsync(keyword: FreshKeyword, fetchedRelatedKeywords?: string[]): Promise<string> {
        const kw = keyword.keyword;
        const sv = keyword.searchVolume || 0;
        const initialReason = keyword.trendingReason;
        const baseName = this.extractBaseName(kw);

        // 🔥 1. 병렬 실행으로 속도 최적화 (뉴스 스니펫 + 연관검색어)
        const [rawSnippets, realKeywordsFromApi] = await Promise.all([
            this.fetchNewsSnippets(kw), // 뉴스 스니펫 (내용 파악용)
            fetchedRelatedKeywords && fetchedRelatedKeywords.length > 0
                ? Promise.resolve(fetchedRelatedKeywords)
                : this.fetchRealRelatedKeywords(kw).catch(() => [] as string[]) // 연관검색어 (구조 파악용)
        ]);

        // 🔥 스니펫에서 크롤링된 연관검색어 추출 ([연관어] 접두사)
        const crawledKeywords = rawSnippets
            .filter(s => s.startsWith('[연관어]'))
            .map(s => s.replace('[연관어] ', ''));

        // 연관어 제외한 순수 뉴스 스니펫
        const newsSnippets = rawSnippets.filter(s => !s.startsWith('[연관어]'));

        // 실시간 키워드 통합 (크롤링 결과 우선)
        const realKeywords = crawledKeywords.length > 0 ? crawledKeywords : realKeywordsFromApi;

        // 🔥 2. 심층 컨텍스트 추론 (뉴스 내용 반영)
        const allText = [kw, initialReason, ...realKeywords, ...newsSnippets].join(' ');
        const inferredType = this.detectIssueType(allText, initialReason);

        // 카테고리 보정
        let category = keyword.category || 'general';
        if (category === 'general' || category === 'life_tips') {
            if (/프로필|나이|인스타|결혼|남편|아내|배우자|집안|아기/.test(allText)) category = 'celeb';
            else if (/가격|비용|후기|장점|단점/.test(allText)) category = 'product';
            else if (/위치|맛집|메뉴|주차/.test(allText)) category = 'place';
        }

        // 🔥 3. 동적 비평 리포트 생성 (뉴스 팩트 포함)
        let analysisReport = "";
        let strategy = "";
        let emoji = "📢";

        // (A) 비보/사회적 이슈
        if (inferredType === 'tragedy') {
            emoji = "🚨";
            analysisReport = `"${kw}" 키워드는 현재 사회적 비보와 관련되어 대중의 관심이 최고조에 달해 있습니다. ${newsSnippets.length > 0 ? `\n(뉴스 요약: ${newsSnippets[0].substring(0, 40)}...)` : ""}`;
            strategy = `
            ✅ **작성 가이드**:
            1. 자극적인 제목보다는 '영면', '추모', '별세' 등 정중한 표현을 사용하세요.
            2. 연관 키워드(나이, 프로필, 배경)를 소제목으로 구성해 독자의 체류시간을 잡으세요.
            3. 팩트 위주의 정확한 정보(뉴스 인용)를 제공하여 신뢰도를 높이는 것이 핵심입니다.
            ⚠️ **주의**: 악플을 유발할 수 있는 추측성 내용은 블로그 지수에 치명적일 수 있습니다.`;
        }
        // (B) 결혼/연애/가족 이슈
        else if (inferredType === 'romance') {
            emoji = "💖";
            analysisReport = `"${baseName}"의 사생활/열애 소식이 트래픽의 중심입니다. ${newsSnippets.length > 0 ? `\n(최신 소식: ${newsSnippets[0].substring(0, 40)}...)` : ""}`;
            strategy = `
            ✅ **작성 가이드**:
            1. '누구와?', '과거의 인연', '공식 입장' 등 궁금증을 해소하는 큐레이션 형태가 유리합니다.
            2. 인스타그램 반응이나 소속사 보도자료를 캡처/요약하여 현장감을 살리세요.
            3. 단순 짜깁기보다는 나만의 '축하' 혹은 '분석' 의견을 덧붙여 독창성을 확보하세요.`;
        }
        // (C) 논란/사건사고
        else if (inferredType === 'scandal') {
            emoji = "⚖️";
            analysisReport = `현재 "${baseName}" 관련 사건의 진실 공방이 매우 뜨겁습니다. ${newsSnippets.length > 0 ? `\n(주요 쟁점: ${newsSnippets[0].substring(0, 40)}...)` : ""}`;
            strategy = `
            ✅ **작성 가이드**:
            1. 양측의 입장을 중립적(A측 주장 vs B측 주장)으로 정리하여 객관성을 유지하세요.
            2. 사건의 발생부터 현재까지의 '타임라인'을 정리해주면 체류시간이 획기적으로 상승합니다.
            3. 관련 법 조항이나 과거 유사 사례를 덧붙여 풍성한 콘텐츠를 만드세요.`;
        }
        // (D) 방송/컴백/작품
        else if (inferredType === 'comeback' || category === 'movie' || category === 'drama') {
            emoji = "🎬";
            analysisReport = `새로운 복귀/작품 소식으로 인해 검색 수요가 폭발했습니다. ${newsSnippets.length > 0 ? `\n(화제의 장면: ${newsSnippets[0].substring(0, 40)}...)` : ""}`;
            strategy = `
            ✅ **작성 가이드**:
            1. 방영 시간, 재방송 채널, OST 등 실전 '꿀정보'를 상단에 배치하세요.
            2. 원작(웹툰/소설)이 있다면 드라마와의 차이점을 분석하는 것이 100점짜리 공략법입니다.
            3. 시청자들의 실시간 반응(커뮤니티 요약)을 포함시켜 공감대를 형성하세요.`;
        }
        // (E) 제품/쇼핑
        else if (inferredType === 'product' || category === 'product' || category === 'it') {
            emoji = "💰";
            analysisReport = `실제 구매를 고민하는 사용자들이 "${kw}"의 검증된 후기를 원하고 있습니다.`;
            strategy = `
            ✅ **작성 가이드**:
            1. '내돈내산' 느낌의 솔직한 장/단점 비교표를 삽입하여 신뢰를 얻으세요.
            2. '최저가 구매 좌표'나 '할인 혜택' 정보는 수익화 전환율(CTR)을 직접적으로 높여줍니다.
            3. 성능 수치보다는 '실생활에서 어떤 점이 편한지' 체감형 후기로 접근하세요.`;
        }
        // (F) 일반/정보성
        else {
            analysisReport = newsSnippets.length > 0
                ? `최근 "${newsSnippets[0].substring(0, 30)}..." 등의 정보를 찾는 검색 수요가 꾸준합니다.`
                : `현재 "${kw}"와(과) 관련된 실용적인 정보를 찾는 수요층이 두터운 상태입니다.`;
            strategy = `
            ✅ **작성 가이드**:
            1. 검색 의도(정의, 방법, 후기)를 빠르게 파악하여 두괄식 핵심 요약부터 제시하세요.
            2. 관련 자주 묻는 질문(FAQ)을 포함하면 구글 서치콘솔 검색 노출 수치까지 잡을 수 있습니다.
            3. '2025 최신', '직접 체험한' 같은 후킹 멘트로 클릭률을 극대화하세요.`;
        }

        const staticKeywords = this.generateSmartRelatedKeywords(baseName, kw, category || 'general', inferredType);

        // 🔥 실시간 키워드가 1개라도 있으면 그것을 우선시하고, 나머지를 AI로 채움
        const combinedKeywords = [...realKeywords];
        if (combinedKeywords.length < 5) {
            staticKeywords.forEach(sk => {
                if (combinedKeywords.length < 5 && !combinedKeywords.includes(sk)) {
                    combinedKeywords.push(sk);
                }
            });
        }

        const keywordList = combinedKeywords.map((k, i) => `   ${i + 1}. **${k}**`).join('\n');
        const sourceLabel = realKeywords.length > 0 ? "🔥 **네이버 실시간 HOT 연관 검색어**" : "🤖 **AI 문맥 기반 추천 토픽**";

        return `### ${emoji} 비평가 분석 리포트\n${analysisReport}\n\n${sourceLabel}:\n${keywordList}\n\n💡 **전문가의 공략 가이드**:\n${strategy}`;
    }

    /**
     * 키워드에 맞는 킬러 타이틀 생성
     */
    generateTitles(keyword: FreshKeyword, count: number = 3, forcedType?: SmartBlockType): string[] {
        const text = (keyword.keyword + (keyword.goldenBackground || "")).replace(/\s/g, "");
        const isTragedy = /사망|별세|비보|고인|추모|숨진채|사건|사고/.test(text);

        const type = forcedType || (isTragedy ? 'issue' : (keyword.smartBlockType || this.inferTypeFromCategory(keyword.category)));
        const templates = (type && SMART_TEMPLATES[type as SmartBlockType])
            ? SMART_TEMPLATES[type as SmartBlockType]
            : (OLD_CATEGORY_TEMPLATES[keyword.category] || SMART_TEMPLATES.general);

        const kwText = keyword.keyword;
        const svText = (keyword.searchVolume || 0) > 1000 ? ` (월 ${(keyword.searchVolume! / 1000).toFixed(1)}K)` : "";
        const year = new Date().getFullYear();

        // 템플릿 셔플 및 풍부한 조합 생성
        const selectedTemplates = [...templates].sort(() => 0.5 - Math.random()).slice(0, count * 2);
        const titles: string[] = [];

        for (const tpl of selectedTemplates) {
            if (titles.length >= count) break;

            let title = tpl
                .replace(/{keyword}/g, kwText)
                .replace(/{year}/g, year.toString())
                .replace(/{age}/g, "??");

            // 100점짜리 수식어 전략 (키워드 특성별 맞춤형)
            if (isTragedy) {
                title = this.applyHook(title, ['안타까운 비보', '추모', '별세', '긴급속보', '속보']);
            } else if (keyword.nicheInfo?.type === 'empty_house') {
                title = this.applyHook(title, ['나만 몰랐던', '숨은 꿀통', '지금이 기회', '의외의 진실']);
            } else if (keyword.isRising || keyword.isEarlyBird) {
                title = this.applyHook(title, ['긴급속보', '실시간 화제', '단독 공개', '충격 근황']);
            } else if (keyword.grade === 'SSS' || (keyword.goldenRatio || 0) > 5) {
                title = this.applyHook(title, ['역대급', '미쳤다', '대박 소식', '필독']);
            } else if (keyword.category === 'life_tips') {
                title = this.applyHook(title, ['삶의 질 상승', '생활 꿀팁', '100% 보장', '내돈내산']);
            } else {
                title = this.applyHook(title); // 일반 랜덤 훅
            }

            // 검색량 힌트 추가 (선택적)
            if (!isTragedy && Math.random() > 0.5 && svText) {
                title += svText;
            }

            titles.push(title);
        }

        return titles;
    }

    private inferTypeFromCategory(category: string): SmartBlockType | undefined {
        switch (category) {
            case 'celeb': return 'person';
            case 'food':
            case 'travel_domestic':
            case 'travel_overseas': return 'place';
            case 'movie':
            case 'drama':
            case 'anime': return 'movie';
            case 'electronics':
            case 'smartphone':
            case 'laptop':
            case 'car': return 'product';
            case 'policy': return 'policy';
            case 'finance':
            case 'stock': return 'stock';
            case 'health': return 'health';
            case 'issue': return 'issue';
            default: return undefined;
        }
    }

    /**
     * 제목 앞에 훅 강조 (중복 방지 및 문맥 반영)
     */
    private applyHook(title: string, specificHooks?: string[]): string {
        if (/^\[.+\]/.test(title)) return title; // 이미 있으면 패스

        const hookList = specificHooks || HOOKS.common;
        const hook = hookList[Math.floor(Math.random() * hookList.length)];

        // 70% 확률로 훅 추가
        return Math.random() > 0.3 ? `[${hook}] ${title}` : title;
    }
}

// ============================================================================
// 싱글톤
// ============================================================================

const generator = new TitleGenerator();
export const getTitleGenerator = () => generator;
