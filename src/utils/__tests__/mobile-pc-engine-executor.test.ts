import { createMobilePcEngineExecutor } from '../../mobile/pc-engine-executor';
import * as fs from 'fs';
import * as path from 'path';
import type {
  MobileJobEnvelope,
  MobileKeywordMetric,
  MobileKeywordResult,
} from '../../mobile/contracts';

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ''}`);
  }
}

function makeJob(product: any, params: any): MobileJobEnvelope<any, MobileKeywordResult> {
  const now = new Date().toISOString();
  return {
    id: `job_${product}`,
    product,
    state: 'running',
    params,
    progressPercent: 1,
    progressMessage: 'test',
    createdAt: now,
    updatedAt: now,
  };
}

function makeSssMetric(index: number, prefix = '모바일 검증 키워드'): MobileKeywordMetric {
  const searchVolume = 1000 + index * 10;
  const documentCount = 100 + index;
  return {
    keyword: `${prefix} ${index}`,
    grade: 'SSS',
    pcSearchVolume: null,
    mobileSearchVolume: null,
    totalSearchVolume: searchVolume,
    documentCount,
    goldenRatio: Number((searchVolume / documentCount).toFixed(2)),
    cpc: 120,
    category: 'policy',
    source: 'fixture-pc-engine',
    intent: 'test',
    evidence: ['pc-engine-fixture'],
    isMeasured: true,
  };
}

function makeSssResult(count: number, prefix?: string): MobileKeywordResult {
  const keywords = Array.from({ length: count }, (_value, index) => makeSssMetric(index + 1, prefix));
  return {
    keywords,
    summary: {
      total: keywords.length,
      sss: keywords.length,
      measured: keywords.length,
      elapsedMs: 1,
      fromCache: false,
      parityMode: 'pc-engine-plus',
    },
  };
}

async function measureFixtureMetrics(metrics: MobileKeywordMetric[]): Promise<MobileKeywordMetric[]> {
  return metrics.map((metric, index) => {
    const totalSearchVolume = 1200 + index * 50;
    const pcSearchVolume = Math.floor(totalSearchVolume * 0.4);
    const mobileSearchVolume = totalSearchVolume - pcSearchVolume;
    const documentCount = 120 + index;
    return {
      ...metric,
      grade: 'SSS',
      pcSearchVolume,
      mobileSearchVolume,
      totalSearchVolume,
      documentCount,
      goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
      cpc: 150,
      evidence: [
        ...metric.evidence,
        'fixture-searchad-volume',
        'fixture-naver-blog-document-count',
      ],
      isMeasured: true,
    };
  });
}

async function runKeywordAnalysis(): Promise<void> {
  const executor = createMobilePcEngineExecutor({
    getEnvConfig: () => ({}),
    measureKeywordMetrics: async (metrics, context) => {
      context.progress(84, 'fixture measured keyword metrics');
      return measureFixtureMetrics(metrics);
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('keyword-analysis', {
    keyword: '고유가 지원금 2차',
    maxRelatedCount: 10,
    includeMindmapPreview: true,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('keyword analysis does not synthesize related rows when live source has no candidates',
    result.keywords.length === 1,
    result.keywords.map((item) => `${item.keyword}:${item.source}`).join('|'));
  assert('keyword analysis keeps requested keyword as first measured row',
    result.keywords[0]?.keyword === '고유가 지원금 2차'
      && result.keywords[0]?.source === 'pc-keyword-analysis-exact'
      && result.keywords[0]?.documentCount !== null,
    result.keywords.slice(0, 3).map((item) => `${item.keyword}:${item.source}:${item.documentCount}`).join('|'));
  assert('keyword analysis keeps Korean candidate text clean',
    result.keywords.every((item) => !/[?]{2,}/.test(item.keyword)));
  assert('keyword analysis uses PC ranker evidence',
    result.keywords.every((item) => item.evidence.some((evidence) => evidence.includes('pc-keyword-expansion-ranker'))));
  assert('keyword analysis returns measured metrics',
    result.summary.measured === 1
      && result.keywords.every((item) => item.isMeasured
        && item.pcSearchVolume !== null
        && item.mobileSearchVolume !== null
        && item.totalSearchVolume !== null
        && item.documentCount !== null
        && item.goldenRatio !== null));
  assert('keyword analysis attaches publish decision for blogger fit',
    result.keywords.every((item) => item.publishDecision
      && item.publishDecision.score >= 0
      && item.publishDecision.score <= 100
      && ['publish', 'conditional', 'exclude'].includes(item.publishDecision.verdict)
      && item.publishDecision.label.length > 0),
    JSON.stringify(result.keywords.map((item) => item.publishDecision)));
  assert('keyword analysis preserves SearchAd/OpenAPI evidence',
    result.keywords.every((item) => item.evidence.includes('fixture-searchad-volume')
      && item.evidence.includes('fixture-naver-blog-document-count')));
  assert('keyword analysis reports progress',
    progress.some((message) => message.includes('PC expansion engine'))
      && progress.some((message) => message.includes('exact keyword only'))
      && progress.some((message) => message.includes('fixture measured keyword metrics')));
}

async function runMindmapExpansion(): Promise<void> {
  let measured = false;
  const executor = createMobilePcEngineExecutor({
    getEnvConfig: () => ({}),
    measureKeywordMetrics: async (metrics, context) => {
      measured = true;
      context.progress(84, 'fixture measured mindmap metrics');
      return measureFixtureMetrics(metrics);
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('mindmap-expansion', {
    seedKeyword: '티빙 정보 유출',
    targetCount: 20,
    includeVolumeMetrics: true,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('mindmap does not synthesize hardcoded rows when live source has no candidates',
    result.keywords.length === 0 && result.summary.total === 0 && result.summary.measured === 0,
    JSON.stringify(result));
  assert('mindmap skips measurement when there are no live expansion candidates',
    measured === false);
  assert('mindmap reports progress',
    progress.some((message) => message.includes('no live mindmap candidates')));
}

async function runMindmapExpansionWithWebContext(): Promise<void> {
  const measured = { value: false };
  const executor = createMobilePcEngineExecutor({
    getEnvConfig: () => ({}),
    measureKeywordMetrics: async (metrics, context) => {
      measured.value = true;
      context.progress(84, 'fixture measured context mindmap metrics');
      return measureFixtureMetrics(metrics);
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('mindmap-expansion', {
    seedKeyword: 'han river reservation',
    targetCount: 5,
    includeVolumeMetrics: true,
    contextKeywords: [
      {
        keyword: 'han river reservation dinner',
        pcSearchVolume: 120,
        mobileSearchVolume: 880,
        totalSearchVolume: 1000,
        documentCount: 180,
        source: 'keyword-analysis-result',
        evidence: ['fixture-web-analysis'],
        isMeasured: true,
      },
      {
        keyword: 'han river reservation time',
        pcSearchVolume: 80,
        mobileSearchVolume: 620,
        totalSearchVolume: 700,
        documentCount: 150,
        source: 'keyword-analysis-result',
        evidence: ['fixture-web-analysis'],
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('mindmap expands from web keyword-analysis context without synthetic fallback',
    result.keywords.length > 0 && result.summary.total > 0 && result.summary.measured > 0,
    JSON.stringify(result));
  assert('mindmap measures context candidates',
    measured.value === true);
  assert('mindmap keeps web context candidates as the expansion source',
    result.keywords.some((item) => item.keyword === 'han river reservation dinner'
      || item.keyword === 'han river reservation time'),
    JSON.stringify(result.keywords.map((item) => item.keyword)));
  assert('mindmap with context runs ranking path',
    progress.some((message) => message.includes('ranking mindmap candidates')));
}

async function runInjectedGoldenDiscovery(): Promise<void> {
  let receivedTarget = 0;
  const executor = createMobilePcEngineExecutor({
    runGoldenDiscovery: async (params, context) => {
      receivedTarget = params.targetCount;
      context.progress(55, 'fixture golden adapter');
      const diverseKeywords = [
        '2027 6모 등급컷 발표',
        '여름 하객 원피스 코디',
        '키작녀 원피스 사이즈 비교',
        '임영웅 콘서트 예매 일정',
        '유재석 새 예능 방송시간',
        '프로야구 올스타전 티켓팅 일정',
        '월드컵 예선 중계 시간',
        '드라마 결말 해석',
        '아이돌 컴백 쇼케이스 일정',
        '청년월세지원 신청 서류',
        '근로장려금 지급일 조회',
        '신혼부부 전세대출 조건',
        '장마철 제습기 전기세 비교',
        '40대 선크림 민감성 피부 추천',
        '아이폰17 사전예약 가격',
        '부산 불꽃축제 주차 위치',
        '여름휴가 제주 숙소 예약',
        '반려견 심장사상충 검사 비용',
        '자취 원룸 에어컨 전기세 비교',
        '아파트 청약 당첨자 발표 조회',
        '초등 여름방학 체험학습 신청',
        '대학생 국가장학금 신청 기간',
        '직장인 연말정산 환급 조회',
        'KBO 개막전 예매 일정',
        '방송 출연진 공개 시간',
        '영화 개봉일 예매 일정',
        '서울 축제 입장료 주차',
        '지역 병원 휴일 진료 시간표',
        '고속버스 시간표 예약',
        '도서관 문화강좌 신청 방법',
      ];
      const baseKeywords = diverseKeywords.slice(0, params.targetCount).map((keyword, index) => {
        const totalSearchVolume = 2400 + index * 110;
        const documentCount = 25 + index;
        return {
          ...makeSssMetric(index + 10, 'diverse golden'),
          keyword,
          totalSearchVolume,
          documentCount,
          goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
        };
      });
      const base = makeSssResult(0, 'policy diverse golden');
      const fakeSss: MobileKeywordMetric = {
        ...makeSssMetric(999, 'fake broad golden'),
        keyword: 'fake broad golden seed',
        grade: 'SSS',
        totalSearchVolume: 360,
        documentCount: 1611294,
        goldenRatio: 0,
      };
      const bareBroadSss: MobileKeywordMetric = {
        ...makeSssMetric(998, 'bare broad golden'),
        keyword: '원피스',
        grade: 'SSS',
        totalSearchVolume: 12000,
        documentCount: 300,
        goldenRatio: 40,
      };
      const repeated: MobileKeywordMetric[] = [
        {
          ...makeSssMetric(1, 'summer dress recommendation'),
          keyword: 'summer dress recommendation',
          totalSearchVolume: 5400,
          documentCount: 420,
          goldenRatio: 12.86,
        },
        {
          ...makeSssMetric(2, 'best summer dress recommendation'),
          keyword: 'best summer dress recommendation',
          totalSearchVolume: 5200,
          documentCount: 430,
          goldenRatio: 12.09,
        },
        {
          ...makeSssMetric(3, 'summer dress recommendation outfit'),
          keyword: 'summer dress recommendation outfit',
          totalSearchVolume: 5100,
          documentCount: 440,
          goldenRatio: 11.59,
        },
      ];
      const keywords = [fakeSss, bareBroadSss, ...repeated, ...baseKeywords];
      return {
        ...base,
        keywords,
        summary: {
          ...base.summary,
          total: keywords.length,
          sss: keywords.length,
          measured: keywords.length,
        },
      };
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('golden-discovery', {
    categoryId: 'policy',
    mode: 'precision',
    targetCount: 1,
    requireSssFloor: true,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('golden precision normalizes to 30 target', receivedTarget === 30);
  assert('golden precision returns 30 SSS metrics', result.summary.sss === 30 && result.keywords.length === 30);
  assert('golden precision removes fake measured SSS rows',
    !result.keywords.some((item) => item.keyword === 'fake broad golden seed'));
  assert('golden precision removes broad bare keywords beginners cannot write immediately',
    !result.keywords.some((item) => item.keyword === '원피스'));
  assert('golden precision limits repeated intent clusters',
    result.keywords.filter((item) => item.keyword.includes('summer dress recommendation')).length <= 2,
    result.keywords.map((item) => item.keyword).join('|'));
  assert('golden precision uses PC adapter fixture', progress.includes('fixture golden adapter'));
}

async function runInjectedGoldenQualityBackfill(): Promise<void> {
  const qualityTopics = [
    '드라마 폭싹 속았수다 방송시간',
    '넷플릭스 신작 드라마 몇부작',
    'KBO 올스타전 중계 일정',
    '청년 월세 지원금 신청 서류',
    '여름 축제 주차 위치',
    '토익 접수 일정 준비물',
    '영화 개봉일 예매 일정',
    '방송 출연진 공개 시간',
    '서울 축제 입장료 주차',
    '지역 병원 휴일 진료 시간표',
    '도서관 문화강좌 신청 방법',
    '박람회 사전등록 신청',
    '소상공인 정책자금 대상 조건',
    '청년도약계좌 신청 방법',
    '스포츠 결승전 티켓팅 일정',
    '아이돌 컴백 쇼케이스 일정',
    '신혼부부 전세대출 조건',
    '독감 백신 접종 비용',
    '고속버스 시간표 예약',
    '콘서트 좌석 배치도 예매',
  ];
  const strictSss = [
    '임영웅 콘서트 예매 일정',
    '2027 6모 등급컷',
    '프로야구 올스타전 티켓팅 일정',
    '부산 드림콘서트 예매 일정',
    '여름 하객 원피스 코디',
    '키작녀 원피스 사이즈 비교',
    '청년월세지원 신청 서류',
    '근로장려금 지급일 조회',
    '신혼부부 전세대출 조건',
    '아이폰17 사전예약 가격',
    '부산 불꽃축제 주차 위치',
    'KBO 개막전 예매 일정',
  ].map((keyword, index): MobileKeywordMetric => {
    const totalSearchVolume = 2600 + index * 170;
    const documentCount = 80 + index * 5;
    return {
      ...makeSssMetric(index + 200, 'strict mobile golden'),
      keyword,
      score: 94 - index * 0.2,
      totalSearchVolume,
      documentCount,
      goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
    };
  });
  const qualityBackfill = qualityTopics.map((keyword, index): MobileKeywordMetric => {
    const isSs = index % 2 === 0;
    const totalSearchVolume = isSs ? 700 + index * 40 : 360 + index * 25;
    const documentCount = isSs ? 100 + index * 4 : 90 + index * 3;
    return {
      ...makeSssMetric(index + 300, 'quality mobile golden'),
      keyword,
      grade: isSs ? 'SS' : 'S',
      score: isSs ? 82 - (index % 4) * 0.2 : 70 - (index % 4) * 0.2,
      totalSearchVolume,
      documentCount,
      goldenRatio: Number((totalSearchVolume / documentCount).toFixed(2)),
    };
  });
  const weakRows: MobileKeywordMetric[] = [
    {
      ...makeSssMetric(901, 'weak mobile golden'),
      keyword: '문서수 폭발 가짜 SSS',
      grade: 'SSS',
      score: 99,
      totalSearchVolume: 9000,
      documentCount: 200000,
      goldenRatio: 0.04,
    },
    {
      ...makeSssMetric(902, 'weak mobile golden'),
      keyword: '원피스',
      grade: 'SS',
      score: 82,
      totalSearchVolume: 5000,
      documentCount: 100,
      goldenRatio: 50,
    },
    {
      ...makeSssMetric(903, 'weak mobile golden'),
      keyword: '드라마 방송시간 부실 후보',
      grade: 'SS',
      score: 74,
      totalSearchVolume: 900,
      documentCount: 180,
      goldenRatio: 5,
    },
  ];
  const executor = createMobilePcEngineExecutor({
    runGoldenDiscovery: async () => {
      const keywords = [...weakRows, ...qualityBackfill, ...strictSss];
      return {
        keywords,
        summary: {
          total: keywords.length,
          sss: strictSss.length + 1,
          measured: keywords.length,
          elapsedMs: 1,
          fromCache: false,
          parityMode: 'pc-engine-plus',
        },
      };
    },
  });
  const result = await executor(makeJob('golden-discovery', {
    categoryId: 'drama',
    mode: 'precision',
    targetCount: 1,
    requireSssFloor: true,
  }), {
    signal: new AbortController().signal,
    progress: () => {},
  });

  assert('golden quality backfill fills normalized 30 results',
    result.keywords.length === 30,
    `${result.keywords.length}: ${result.keywords.map((item) => `${item.grade} ${item.keyword}`).join('|')}`);
  assert('golden quality backfill keeps scarce SSS plus quality SS/S only',
    result.summary.sss === 12
      && result.keywords.slice(0, 12).every((item) => item.grade === 'SSS')
      && result.keywords.slice(12).every((item) => item.grade === 'SS' || item.grade === 'S'),
    result.keywords.map((item) => `${item.grade} ${item.keyword}`).join('|'));
  assert('golden quality backfill removes weak rows',
    !result.keywords.some((item) => ['문서수 폭발 가짜 SSS', '원피스', '드라마 방송시간 부실 후보'].includes(item.keyword)));
}

async function runInjectedProTraffic(): Promise<void> {
  let receivedTarget = 0;
  let receivedContextKeywords = 0;
  const executor = createMobilePcEngineExecutor({
    runProTraffic: async (params, context) => {
      receivedTarget = params.targetCount;
      receivedContextKeywords = params.contextKeywords?.length || 0;
      context.progress(55, 'fixture pro adapter');
      return makeSssResult(params.targetCount, 'PRO 트래픽 황금');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('pro-traffic-hunter', {
    categoryId: 'entertainment',
    targetCount: 250,
    includeSeasonal: true,
    includeEvergreen: true,
    includeFreshIssue: true,
    contextKeywords: [
      {
        keyword: 'context hot traffic keyword',
        pcSearchVolume: 300,
        mobileSearchVolume: 1700,
        totalSearchVolume: 2000,
        documentCount: 200,
        source: 'web-analysis-result',
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('pro target preserves 250 requested amount', receivedTarget === 250);
  assert('pro target preserves web context keywords', receivedContextKeywords === 1);
  assert('pro target returns 250 SSS metrics', result.summary.sss === 250 && result.keywords.length === 250);
  assert('pro target uses PC adapter fixture', progress.includes('fixture pro adapter'));
}

async function runHomeBoardDefaultAdapter(): Promise<void> {
  const executor = createMobilePcEngineExecutor();
  const progress: string[] = [];
  const result = await executor(makeJob('home-board-hunter', {
    categoryId: 'policy',
    seedKeyword: '소상공인 지원금',
    targetCount: 30,
    requireSplusFloor: true,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('home board returns 30 PC planner candidates', result.keywords.length === 30);
  assert('home board maps S+ home candidates to SSS', result.summary.sss === 30);
  assert('home board includes publish title evidence',
    result.keywords.every((item) => item.evidence.some((evidence) => evidence.startsWith('title: '))));
  assert('home board reports PC home intent progress',
    progress.some((message) => message.includes('PC home intent engine')));
}

async function runInjectedKinHiddenHoney(): Promise<void> {
  let receivedTab = '';
  let receivedContextKeywords = 0;
  const executor = createMobilePcEngineExecutor({
    runKinHiddenHoney: async (params, context) => {
      receivedTab = params.tabType;
      receivedContextKeywords = params.contextKeywords?.length || 0;
      context.progress(55, 'fixture kin adapter');
      return makeSssResult(params.targetCount, '지식인 꿀질문');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('kin-hidden-honey', {
    tabType: 'hidden',
    targetCount: 15,
    isPremiumRequest: true,
    contextKeywords: [
      {
        keyword: 'kin context question keyword',
        totalSearchVolume: 1400,
        documentCount: 120,
        source: 'web-analysis-result',
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('kin hidden tab is preserved', receivedTab === 'hidden');
  assert('kin hidden preserves web context keywords', receivedContextKeywords === 1);
  assert('kin hidden returns requested SSS fixtures', result.keywords.length === 15 && result.summary.sss === 15);
  assert('kin hidden uses injected PC adapter fixture', progress.includes('fixture kin adapter'));
}

async function runInjectedShoppingConnect(): Promise<void> {
  let received: any = null;
  const executor = createMobilePcEngineExecutor({
    runShoppingConnect: async (params, context) => {
      received = params;
      context.progress(55, 'fixture shopping adapter');
      return makeSssResult(params.targetCount, '쇼핑 커넥트');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('shopping-connect', {
    keyword: '  무선 이어폰  ',
    targetCount: 999,
    sort: 'unknown',
    contextKeywords: [
      {
        keyword: 'wireless earbuds hot product',
        totalSearchVolume: 2200,
        documentCount: 180,
        source: 'web-analysis-result',
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('shopping normalizes keyword', received.keyword === '무선 이어폰');
  assert('shopping target clamps to 80', received.targetCount === 80);
  assert('shopping sort defaults to sim', received.sort === 'sim');
  assert('shopping preserves web context keywords', received.contextKeywords.length === 1);
  assert('shopping returns injected SSS fixtures', result.keywords.length === 80 && result.summary.sss === 80);
  assert('shopping uses injected PC adapter fixture', progress.includes('fixture shopping adapter'));

  received = null;
  const floorResult = await executor(makeJob('shopping-connect', {
    keyword: '선크림',
    targetCount: 5,
    sort: 'date',
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });
  assert('shopping target floors to 30 sellable product keywords', received.targetCount === 30);
  assert('shopping floor request returns 30 fixtures', floorResult.keywords.length === 30 && floorResult.summary.sss === 30);
}

async function runInjectedYoutubeGolden(): Promise<void> {
  let received: any = null;
  const executor = createMobilePcEngineExecutor({
    runYoutubeGolden: async (params, context) => {
      received = params;
      context.progress(55, 'fixture youtube adapter');
      return makeSssResult(params.maxResults, '유튜브 황금키워드');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('youtube-golden', {
    maxResults: 999,
    categoryId: ' 24 ',
    crossReferenceNaver: false,
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('youtube target clamps to 100', received.maxResults === 100);
  assert('youtube category is normalized', received.categoryId === '24');
  assert('youtube cross reference false is preserved', received.crossReferenceNaver === false);
  assert('youtube returns injected SSS fixtures', result.keywords.length === 100 && result.summary.sss === 100);
  assert('youtube uses injected PC adapter fixture', progress.includes('fixture youtube adapter'));
}

async function runInjectedNaverMate(): Promise<void> {
  let received: any = null;
  const executor = createMobilePcEngineExecutor({
    runNaverMate: async (params, context) => {
      received = params;
      context.progress(55, 'fixture naver mate adapter');
      return makeSssResult(params.targetCount, '네이버 메이트');
    },
  });
  const progress: string[] = [];
  const result = await executor(makeJob('naver-mate-hunter', {
    seedKeyword: '  소상공인 지원금  ',
    targetCount: 500,
    includeAutocomplete: false,
    includeRelated: false,
    includeVolumeMetrics: false,
    contextKeywords: [
      {
        keyword: 'naver mate context longtail',
        totalSearchVolume: 3100,
        documentCount: 220,
        source: 'web-analysis-result',
        isMeasured: true,
      },
    ],
  }), {
    signal: new AbortController().signal,
    progress: (_percent, message) => progress.push(message),
  });

  assert('naver mate normalizes seed keyword', received.seedKeyword === '소상공인 지원금');
  assert('naver mate target clamps to 120', received.targetCount === 120);
  assert('naver mate option false values are preserved',
    received.includeAutocomplete === false
      && received.includeRelated === false
      && received.includeVolumeMetrics === false);
  assert('naver mate preserves web context keywords', received.contextKeywords.length === 1);
  assert('naver mate returns injected SSS fixtures', result.keywords.length === 120 && result.summary.sss === 120);
  assert('naver mate uses injected PC adapter fixture', progress.includes('fixture naver mate adapter'));
}

function runFallbackRegressionGuards(): void {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'mobile', 'pc-engine-executor.ts'), 'utf8');
  assert('shopping connect has SearchAd/OpenAPI quota fallback',
    source.includes('pc-shopping-quota-searchad-fallback')
      && source.includes('isQuotaLimitError')
      && source.includes('shopping quota exhausted')
      && source.includes('pc-shopping-empty-searchad-fallback')
      && source.includes('shopping returned 0 products'));
  assert('shopping connect can run seedless auto discovery on the server',
    source.includes('const autoDiscovery = !params.keyword')
      && source.includes('getShoppingDiscoverySeeds(params.targetCount)')
      && source.includes("source: 'auto-discovery'"),
    'seedless shopping connect still requires a manual keyword');
  assert('KIN empty result has live source signal fallback',
    source.includes('pc-kin-live-source-fallback')
      && source.includes('kin-question-source-gap')
      && source.includes('buildSourceSignalMetrics')
      && source.includes('sourceSignalKeyword'));
  assert('YouTube empty result has live source signal fallback',
    source.includes('pc-youtube-live-source-fallback')
      && source.includes('youtube-trend-source-gap')
      && source.includes('buildSourceSignalMetrics')
      && source.includes("'all'"));
}

(async () => {
  await runKeywordAnalysis();
  await runMindmapExpansion();
  await runMindmapExpansionWithWebContext();
  await runInjectedGoldenDiscovery();
  await runInjectedGoldenQualityBackfill();
  await runInjectedProTraffic();
  await runHomeBoardDefaultAdapter();
  await runInjectedKinHiddenHoney();
  await runInjectedShoppingConnect();
  await runInjectedYoutubeGolden();
  await runInjectedNaverMate();
  runFallbackRegressionGuards();
  console.log('[mobile-pc-engine-executor.test] passed');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
