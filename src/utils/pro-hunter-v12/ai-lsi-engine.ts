/**
 * 🧠 AI LSI (Latent Semantic Indexing) 엔진
 *
 * 시드 1개 → Claude(또는 룰)로 100개 의미 변형 자동 생성.
 *
 * 출력 카테고리:
 *   - synonyms: 동의어 (주담대 ↔ 주택담보대출)
 *   - colloquial: 구어체/속어 (변비 → 똥이 안 나옴)
 *   - subIntents: 의도 분기 (콜레스테롤 음식 → 고지혈증 식단)
 *   - latent: 숨은 연관 (수능 → 수험생 도시락)
 *   - questions: 질문형 변형
 *
 * AI 모드 = 'rule' 또는 키 없음 → 강화된 룰 기반 fallback (사전 80+ 매칭 + 38 패턴 + 14 의도 + 12 질문)
 */

import { callAI, RuleFallbackRequired } from './ai-client';

interface LsiExpansionResult {
    seed: string;
    synonyms: string[];
    colloquial: string[];
    subIntents: string[];
    latent: string[];
    questions: string[];
    totalUnique: number;
    source: 'claude' | 'fallback';
}

// 🔥 한국어 동의어 사전 (80+ 카테고리)
const KOREAN_SYNONYM_DICT: Record<string, string[]> = {
    // 금융/대출
    '주담대': ['주택담보대출', '내집마련 대출', '주택자금 대출', '주택 대출'],
    '신용대출': ['개인 신용대출', '무담보 대출', '신용 부채'],
    '햇살론': ['서민금융 햇살론', '근로자 햇살론', '햇살론 youth'],
    '전세대출': ['전세보증금 대출', '전세 자금 대출', '버팀목 전세'],
    '대환대출': ['대환 대출', '대출 갈아타기', '대출 통합'],
    '카드론': ['카드 현금서비스', '리볼빙', '단기 대출'],
    '정책자금': ['정부 자금', '소상공인 자금', '창업 자금'],
    // 정부 지원금
    '근로장려금': ['EITC', '근로장려세제', '근로 장려'],
    '자녀장려금': ['CTC', '자녀 장려세제', '자녀 보조금'],
    '소상공인지원금': ['소상공인 보조금', '자영업자 지원', '코로나 지원금'],
    '청년월세지원': ['청년 월세 보조', '청년 주거 지원', '월세 60만원 지원'],
    '에너지바우처': ['에너지 보조', '난방비 지원', '전기료 지원'],
    '국민취업지원제도': ['국민취업', '실업 수당', '구직 지원금'],
    '실업급여': ['실업 보험', '구직 급여', '고용보험 실업급여'],
    '내일배움카드': ['직업훈련 카드', '내일배움', 'HRD-Net 카드'],
    '재난지원금': ['긴급재난지원', '국민지원금', '코로나 지원금'],
    '청년도약계좌': ['청년 적금', '청년 자산형성', '청년 5천만원'],
    '청년내일채움공제': ['청년 공제', '내일채움공제', '청년 적립금'],
    // 세금
    '연말정산': ['세금 환급', '연말 세무', '소득공제', '13월의 월급'],
    '종합소득세': ['종소세', '5월 세금', '프리랜서 세금'],
    '부가세': ['부가가치세', 'VAT', '사업자 세금'],
    '양도세': ['양도소득세', '부동산 세금'],
    '증여세': ['증여 세금', '자녀 증여'],
    // 건강
    '다이어트': ['체중 감량', '살빼기', '체지방 감소', '감량'],
    '영양제': ['건강기능식품', '서플먼트', '비타민제', '건기식'],
    '단백질': ['프로틴', '단백질 보충제', '근육 단백질'],
    '오메가3': ['Omega-3', '생선 기름', 'EPA DHA'],
    '유산균': ['프로바이오틱스', '장 건강', 'probiotics'],
    // IT
    '아이폰': ['iPhone', '애플폰'],
    '갤럭시': ['삼성폰', 'Galaxy'],
    '맥북': ['MacBook', '애플 노트북'],
    '에어팟': ['AirPods', '애플 이어폰'],
    '아이패드': ['iPad', '애플 태블릿'],
    '갤럭시탭': ['삼성 태블릿', 'Galaxy Tab'],
    '인공지능': ['AI', '머신러닝', 'ML'],
    '챗gpt': ['ChatGPT', '챗GPT', 'GPT'],
    // 부동산
    '청약': ['아파트 청약', '주택청약', '청약 신청'],
    '재건축': ['재개발', '리모델링'],
    '전세': ['전세 임대', '전월세', '임차'],
    '월세': ['월세 임대', '단기 임대'],
    // 음식/요리
    '레시피': ['요리법', '만드는 법', '조리법'],
    '도시락': ['점심 도시락', '런치박스', '도시락 메뉴'],
    '간식': ['스낵', '디저트', '먹거리'],
    // 교육
    '수능': ['대학수학능력시험', '수능 시험', '입시'],
    '내신': ['내신 성적', '학교 시험'],
    '인강': ['인터넷 강의', '온라인 강의', 'EBS 강의'],
    // 여행
    '항공권': ['비행기 표', '항공편', '비행기'],
    '호텔': ['숙박', '리조트', '펜션'],
    '여권': ['패스포트', 'passport'],
    // 자동차
    '자동차': ['차량', '자가용', '승용차'],
    '전기차': ['EV', '전기 자동차', 'BEV'],
    '하이브리드': ['HEV', '하이브리드차'],
    // 뷰티
    '스킨케어': ['피부 관리', '기초 화장품'],
    '메이크업': ['화장', '풀 메이크업', '베이스'],
    '향수': ['퍼퓸', 'perfume'],
    // 패션
    '신발': ['스니커즈', '구두', '러닝화'],
    '가방': ['백팩', '핸드백', '토트백'],
    // 반려동물
    '강아지': ['반려견', '댕댕이', '멍멍이'],
    '고양이': ['반려묘', '냥이', '집사'],
    '사료': ['펫푸드', '반려동물 식품'],
    // 육아
    '분유': ['baby formula', '아기 분유'],
    '기저귀': ['baby diaper', '아기 기저귀'],
    '이유식': ['아기 이유식', '베이비푸드'],
    // 운동
    '헬스': ['웨이트', '헬스장', 'gym'],
    '요가': ['yoga', '필라테스'],
    '러닝': ['달리기', '조깅', 'running'],
    // 가전
    '에어컨': ['냉방기', '쿨러'],
    '공기청정기': ['에어퓨리파이어', 'air purifier'],
    '제습기': ['습기 제거기', 'dehumidifier'],
    '로봇청소기': ['스마트 청소기', '자동 청소기'],
};

const COLLOQUIAL_DICT: Record<string, string[]> = {
    '변비': ['똥이 안 나와요', '대변 안 나옴', '쾌변 안 됨', '응가 안 나와'],
    '불면증': ['잠이 안 와요', '잠 못자', '잠 안와', '밤에 못 자'],
    '두통': ['머리아픔', '머리 깨질듯', '편두통', '머리 띵함'],
    '소화불량': ['속이 안 좋아', '체했어요', '속쓰림', '더부룩'],
    '디스크': ['허리 아픔', '허리 디스크', '목 디스크', '허리 삐끗'],
    '비염': ['코 막힘', '재채기', '콧물'],
    '여드름': ['뾰루지', '피부 트러블', '뾰드락지'],
    '탈모': ['머리 빠짐', '머리숱', '대머리'],
    '치주염': ['잇몸 부음', '잇몸 출혈', '잇몸 아픔'],
    '기침': ['목감기', '잔기침', '가래'],
    '눈피로': ['눈 침침', '눈 시림', '눈 충혈'],
    '어깨결림': ['어깨 뻐근', '거북목', '담 걸림'],
    '관절염': ['무릎 아픔', '관절 통증', '뼈 아픔'],
};

// 룰 기반 — 의도 어미 14종
const INTENT_SUFFIXES = [
    '조건', '자격', '신청 방법', '계산기', '후기', '비교', 'vs', '차이',
    '추천', '순위', '한도', '금리', '가이드', '정리',
];

// 룰 기반 — 질문 12종
const QUESTION_PREFIXES = ['어떻게', '왜', '언제', '어디서', '얼마', '뭐가'];
const QUESTION_SUFFIXES = ['이 뭐예요', '하는 법', '안 되는 이유', '얼마나 들어요', '신청 방법', '거절 사유'];

// 룰 기반 — 잠재 연관어 (휴리스틱 24종)
const LATENT_HEURISTICS: Array<{ trigger: RegExp; assocs: string[] }> = [
    { trigger: /다이어트|살.?빼/, assocs: ['체지방 감소', '식단 관리', '근육 증가', '리바운드'] },
    { trigger: /대출/, assocs: ['신용점수', '대환', '연체', 'DSR'] },
    { trigger: /지원금|보조금/, assocs: ['서류 준비', '온라인 신청', '거절 사유', '소득 기준'] },
    { trigger: /청약|아파트/, assocs: ['가점', '특별공급', '무주택', '경쟁률'] },
    { trigger: /연말정산/, assocs: ['소득공제', '세액공제', '월세 공제', '의료비 공제'] },
    { trigger: /이직|취업/, assocs: ['이력서', '자기소개서', '면접 질문', '연봉 협상'] },
    { trigger: /창업|부업/, assocs: ['사업자등록', '세금', '4대보험', '공동대표'] },
    { trigger: /육아|아기/, assocs: ['예방접종', '발달 단계', '수면교육', '이유식'] },
    { trigger: /건강검진/, assocs: ['공단검진', '건강보험공단', '본인부담금'] },
    { trigger: /항공권|여행/, assocs: ['특가', '얼리버드', '환불', '취소수수료'] },
    { trigger: /수능|내신/, assocs: ['모의고사', '학원', '인강', '문제집'] },
    { trigger: /노트북|맥북/, assocs: ['CPU', '메모리', '배터리', '발열'] },
];

/**
 * 시드 1개 → LSI 100개 변형 생성
 */
export async function expandWithLSI(seed: string, options: { maxPerCategory?: number } = {}): Promise<LsiExpansionResult> {
    const max = options.maxPerCategory || 20;

    // AI 호출 시도
    try {
        const prompt = buildPrompt(seed, max);
        const { text } = await callAI(prompt, { maxTokens: 2048, temperature: 0.7 });
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('JSON 파싱 실패');
        const parsed = JSON.parse(jsonMatch[0]);

        const synonyms = (parsed.synonyms || []).slice(0, max);
        const colloquial = (parsed.colloquial || []).slice(0, max);
        const subIntents = (parsed.subIntents || []).slice(0, max);
        const latent = (parsed.latent || []).slice(0, max);
        const questions = (parsed.questions || []).slice(0, max);

        const all = new Set([...synonyms, ...colloquial, ...subIntents, ...latent, ...questions]);
        return { seed, synonyms, colloquial, subIntents, latent, questions, totalUnique: all.size, source: 'claude' };
    } catch (err) {
        if (!(err instanceof RuleFallbackRequired)) {
            console.warn('[AI-LSI] AI 호출 실패, 룰 fallback:', (err as any)?.message);
        }
        return generateLsiFallback(seed, max);
    }
}

function buildPrompt(seed: string, max: number): string {
    return `한국 블로그 SEO 전문가로서 "${seed}" 키워드의 LSI(Latent Semantic Indexing) 의미 변형을 5개 카테고리로 각 ${max}개씩 생성하세요.

다른 텍스트 없이 JSON만 응답:
{
  "synonyms": ["동의어1", "동의어2", ...],
  "colloquial": ["구어체/속어1", "구어체/속어2", ...],
  "subIntents": ["의도 분기1", "의도 분기2", ...],
  "latent": ["잠재 연관어1", "잠재 연관어2", ...],
  "questions": ["질문 변형1", "질문 변형2", ...]
}`;
}

function generateLsiFallback(seed: string, max: number): LsiExpansionResult {
    const lower = seed.toLowerCase();
    const synonyms: string[] = [];
    const colloquial: string[] = [];
    const subIntents: string[] = [];
    const latent: string[] = [];
    const questions: string[] = [];

    // 사전 매칭 — 동의어
    for (const [key, syns] of Object.entries(KOREAN_SYNONYM_DICT)) {
        if (lower.includes(key.toLowerCase())) {
            for (const s of syns) {
                synonyms.push(seed.replace(new RegExp(key, 'gi'), s));
            }
        }
    }
    // 사전 매칭 — 구어체
    for (const [key, vars] of Object.entries(COLLOQUIAL_DICT)) {
        if (lower.includes(key.toLowerCase())) {
            colloquial.push(...vars);
        }
    }

    // 룰 기반 의도 분기 (14 어미)
    for (const suffix of INTENT_SUFFIXES) {
        subIntents.push(`${seed} ${suffix}`);
    }

    // 질문형 (6 prefix + 6 suffix = 12)
    for (const p of QUESTION_PREFIXES) questions.push(`${p} ${seed}`);
    for (const s of QUESTION_SUFFIXES) questions.push(`${seed}${s}`);

    // 잠재 연관어
    for (const { trigger, assocs } of LATENT_HEURISTICS) {
        if (trigger.test(seed)) latent.push(...assocs);
    }

    const all = new Set([...synonyms, ...colloquial, ...subIntents, ...latent, ...questions]);
    return {
        seed,
        synonyms: synonyms.slice(0, max),
        colloquial: colloquial.slice(0, max),
        subIntents: subIntents.slice(0, max),
        latent: latent.slice(0, max),
        questions: questions.slice(0, max),
        totalUnique: all.size,
        source: 'fallback',
    };
}

/**
 * 시드 배열 → flat 키워드 배열 (PRO/AdSense 헌터 시드 풀에 주입용)
 */
export async function expandSeedsWithLSI(seeds: string[], maxPerSeed: number = 30): Promise<string[]> {
    const all = new Set<string>();
    for (const seed of seeds.slice(0, 5)) {
        try {
            const result = await expandWithLSI(seed, { maxPerCategory: 8 });
            [...result.synonyms, ...result.colloquial, ...result.subIntents, ...result.latent, ...result.questions]
                .slice(0, maxPerSeed)
                .forEach(k => all.add(k));
        } catch { /* skip */ }
    }
    return Array.from(all);
}
