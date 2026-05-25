/**
 * 🛡️ 2026 네이버 알고리즘 매핑 — LEWORD 기능 ↔ 신용어 공식 매핑표
 *
 * 작성: 2026-05-25
 * 목적: 진단서/마케팅에서 인용 가능한 "이 도구가 어느 알고리즘에 어떻게 대응하는가" 명세
 *
 * ─────────────────────────────────────────────────────────
 * 2025~2026 네이버 검색 6대 격변 타임라인
 * ─────────────────────────────────────────────────────────
 *   2025-11-05  RSS HTTP/1.0 차단         — 외부 블로그 분석 도구 데이터 두절
 *   2025-12     BlogDex(블덱스) 서비스 종료 — "블로그 지수" 시대 공식 종료
 *   2026-04-27  AI 탭 베타 출시 (멤버십)    — 검색이 대화형 답변으로 변환
 *   2026-04-30  19년 된 연관검색어 종료     — 키워드 확장 방식 자체 변화
 *   2026-05-07  통합검색에서 블로그 사라짐  — 노출 평소의 절반 이하 급락
 *   진행 중     블로그·카페·웹문서 통합 랭킹 — 블로그는 "답변 소스 한 갈래"
 *
 * ─────────────────────────────────────────────────────────
 * 진단서가 지목한 신용어 ↔ LEWORD 구현 위치 매핑
 * ─────────────────────────────────────────────────────────
 */

export const ALGORITHM_2026_MAP = {
    // ═══ C-Rank (출처 신뢰도) ═══
    // 네이버가 블로그 자체의 권위(주제 누적, 운영 일수, 일평균 방문자)를 평가하는 핵심 축.
    // 키워드 점수가 높아도 블로그 권위가 낮으면 상위 노출 불가.
    cRank: {
        label: 'C-Rank',
        fullName: '출처 신뢰도 (Content Rank)',
        owner: 'naver-home-score-engine.ts',
        signals: [
            '일평균 방문자 (C-Rank 누적 신호)',
            '운영 일수 (긴 운영 = 누적 권위)',
            '카테고리 적합도 (주제 일관성)',
        ],
        leword: '키워드 별 노출 가능성을 블로그 권위와 함께 평가',
    },

    // ═══ D.I.A.+ (검색 의도 부합도) ═══
    // Deep Intent Analysis Plus — 검색자의 진짜 의도와 콘텐츠가 얼마나 맞는지.
    // LEWORD는 SERP gap 분석으로 의도 부합 판정.
    diaPlus: {
        label: 'D.I.A.+',
        fullName: '심층 의도 분석 (Deep Intent Analysis Plus)',
        owner: 'pro-hunter-v12/serp-content-analyzer.ts',
        signals: [
            'SERP 상위 10개 분석 (gap detection)',
            'gap analysis (놓친 의도 식별)',
            'blueprint generation (의도 부합 outline)',
        ],
        leword: 'SERP gap을 분석해 의도 부합 콘텐츠 청사진 제공',
    },

    // ═══ Cue: (답변 완결성) ═══
    // Q-Cue System — 검색어가 질문이면 답변의 완결성을 평가.
    // LEWORD는 outline-generator로 완결 구조 생성.
    cue: {
        label: 'Cue:',
        fullName: '큐 (Question-Cue Answer Completeness)',
        owner: 'pro-hunter-v12/outline-generator.ts',
        signals: [
            'outline 구조 (서론-본론-결론 완결성)',
            'first-paragraph 답변 제시',
            'meta-description 요약 (snippet 인용 가능성)',
        ],
        leword: '질문형 키워드에 대해 완결 답변 구조 자동 생성',
    },

    // ═══ AEO (Answer Engine Optimization) ═══
    // AI 답변 엔진 (AI 브리핑, AI 탭)이 어떻게 우리 콘텐츠를 인용하게 만들지.
    // LEWORD는 AI 브리핑 영역 직접 마이닝 + 그 안의 엔티티/질문 발굴.
    aeo: {
        label: 'AEO',
        fullName: '답변 엔진 최적화 (Answer Engine Optimization)',
        owner: 'related-keyword-fallback.ts (fetchNaverAiBriefingKeywords)',
        signals: [
            '네이버 AI 브리핑 영역 직접 스크래핑',
            'AI 브리핑 미점령 키워드 우선 발굴 (gap 공략)',
            'AI 답변이 인용할 만한 엔티티/숫자/리스트 구조 유도',
        ],
        leword: 'AI 브리핑이 잡지 않은 키워드를 발굴 + AI가 인용할 outline 생성',
    },

    // ═══ GEO (Generative Engine Optimization) ═══
    // 생성형 AI 검색 (ChatGPT, Perplexity, Gemini 등) 최적화.
    // LEWORD는 다중 검색엔진 SERP 분석으로 GEO 동시 대응.
    geo: {
        label: 'GEO',
        fullName: '생성형 검색 최적화 (Generative Engine Optimization)',
        owner: 'pro-hunter-v12/google-serp.ts + serp-content-fetcher.ts',
        signals: [
            '구글 SERP top10 동시 분석 (Google AI Overviews 대응)',
            '다중 검색엔진 (네이버·구글·다음) 교차 시그널',
            '구조화된 답변 청사진 (LLM 인용 친화 형식)',
        ],
        leword: '네이버 + 구글 다중 엔진 동시 분석으로 AI 인용 가능성 극대화',
    },

    // ═══ 신통합 랭킹 (스마트블록) ═══
    // 블로그·카페·웹문서를 통합 평가. "어느 스마트블록에 들어가야 하는가"가 핵심.
    smartBlock: {
        label: '신통합 랭킹',
        fullName: '스마트블록 통합 랭킹 (Smart Block Integrated Ranking)',
        owner: 'pro-hunter-v12/smartblock-parser.ts + smartblock-assistant.ts',
        signals: [
            '블록 타입별 진입 CTR 모델 (popular_post / view / influencer / cafe / shopping ...)',
            '빈자리(vacancy) 감지 — 경쟁자 약한 블록 우선',
            '블록 진입 CTR에 맞는 제목·outline 자동 변형',
        ],
        leword: '키워드별 어느 스마트블록의 빈자리를 노릴지 명시 + 제목 3-variant',
    },

    // ═══ 토픽 어쏘리티 (주제 권위) ═══
    // 블로그 전체가 한 주제에 얼마나 집중되어 있는가.
    topicAuthority: {
        label: '토픽 어쏘리티',
        fullName: '주제 권위 (Topic Authority)',
        owner: 'pro-hunter-v12/authority-db.ts + naver-home-score-engine.ts',
        signals: [
            'competitor authority DB (상위 노출자의 권위 추적)',
            '카테고리 적합도 점수 (20점 만점)',
            '사용자 블로그 토픽 집중도 평가',
        ],
        leword: '내 블로그가 어느 토픽에 권위가 있는지 추정 + 권위 매칭 키워드 추천',
    },
} as const;

// ─────────────────────────────────────────────────────────
// 4요소 공식 (진단서 권장 마케팅 메시지)
//   "2026년 네이버에서 살아남는 키워드 공식"
//     ① 검색량 (실측, 검색광고 API)
//     ② 경쟁글 (문서수, 네이버 통합검색)
//     ③ 실시간성 (시그널BZ + 다중 트렌드 소스)
//     ④ AI 브리핑 미점령 (AI가 아직 답하지 않은 영역)
// ─────────────────────────────────────────────────────────
export const FOUR_FACTOR_FORMULA_2026 = {
    factor1_volume: { name: '실측 검색량', source: '네이버 검색광고 API', threshold: 30 },
    factor2_competition: { name: '경쟁 문서수', source: '네이버 통합검색', threshold: 30 },
    factor3_realtime: { name: '실시간성', source: '시그널BZ + 네이버 트렌드 + 4매체', threshold: null },
    factor4_aiClean: { name: 'AI 브리핑 미점령', source: 'AI 브리핑 영역 마이닝', threshold: null },
} as const;

// ─────────────────────────────────────────────────────────
// 17개 데이터 소스 교차검증 카탈로그
//   (실제 등록 ~30개, 활성 ~18개. "17"은 보수적 마케팅 숫자)
//   ref: src/utils/sources/source-bootstrap.ts
// ─────────────────────────────────────────────────────────
export const CROSS_VALIDATION_SOURCES = [
    { id: 'naver-search-ad', tier: 'core', kind: '네이버 검색광고 API (실측 검색량)' },
    { id: 'naver-datalab', tier: 'core', kind: '네이버 데이터랩 (모멘텀 + 이동평균)' },
    { id: 'naver-autocomplete', tier: 'core', kind: '네이버 자동완성 (PC/모바일/쇼핑 3채널)' },
    { id: 'naver-smartblock', tier: 'core', kind: '네이버 스마트블록 (신통합 랭킹)' },
    { id: 'naver-ai-briefing', tier: 'core', kind: '네이버 AI 브리핑 영역 마이닝' },
    { id: 'naver-shopping', tier: 'core', kind: '쇼핑 인사이트 클릭 점유율' },
    { id: 'naver-news', tier: 'pro', kind: '네이버 뉴스 랭킹 (실시간)' },
    { id: 'signal-bz', tier: 'core', kind: '시그널BZ 실시간 트렌드' },
    { id: 'youtube-kr', tier: 'lite', kind: 'YouTube KR 트렌딩 + 댓글 마이닝' },
    { id: 'google-trends', tier: 'pro', kind: '구글 트렌드 + SERP' },
    { id: 'google-autocomplete', tier: 'core', kind: '구글 자동완성 (KR)' },
    { id: 'daum-autocomplete', tier: 'pro', kind: '다음 자동완성 + 실시간' },
    { id: 'nate-realtime', tier: 'pro', kind: '네이트 실시간' },
    { id: 'zum-realtime', tier: 'pro', kind: '줌 실시간' },
    { id: 'korea-kr', tier: 'pro', kind: '정책브리핑 (정부 지원금)' },
    { id: 'yna-breaking', tier: 'pro', kind: '연합뉴스 속보 RSS' },
    { id: 'wikipedia-ko', tier: 'lite', kind: '위키피디아 한국어 Top1000' },
    { id: 'community-bundle', tier: 'pro', kind: '클리앙·뽐뿌·디시·루리웹·MLB파크 (집단지성)' },
] as const;

// 진단서 인용 메시지 (마케팅용)
export const CITATION_LINE = `
LEWORD는 2026년 네이버 검색 격변(연관검색어 종료 2026-04-30, 통합검색 변화 2026-05-07,
AI 브리핑 도입 2026-04-27, 블덱스 종료 2025-12)에 모두 코드 레벨로 대응 완료된 도구입니다.

- C-Rank 시뮬레이션  → src/utils/pro-hunter-v12/naver-home-score-engine.ts
- D.I.A.+ 의도 분석   → src/utils/pro-hunter-v12/serp-content-analyzer.ts
- Cue: 답변 완결성   → src/utils/pro-hunter-v12/outline-generator.ts
- AEO 답변 엔진 최적화 → src/utils/related-keyword-fallback.ts (AI 브리핑 마이닝)
- GEO 생성형 엔진 최적화 → src/utils/pro-hunter-v12/google-serp.ts
- 신통합 랭킹 (스마트블록) → src/utils/pro-hunter-v12/smartblock-parser.ts
- 토픽 어쏘리티       → src/utils/pro-hunter-v12/authority-db.ts
- 연관검색어 종료 폴백  → src/utils/related-keyword-fallback.ts (5중 폴백, 2026-04-30 종료 명시)
- 블덱스 종료 대응     → src/utils/blog-index-via-datalab.ts (자체 추정 우회)
`;
